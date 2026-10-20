import { useCallback, useEffect, useState, useTransition } from 'react'
import { Checkbox } from '../../components/Checkbox'
import { Combobox } from '../../components/Combobox'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Loader } from '../../components/Loader'
import { useStrings } from '../../components/Provider'
import { Select } from '../../components/Select'
import { toast } from '../../components/Toast'
import { Tooltip } from '../../components/Tooltip'
import { ShareIcon, TrashIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import type { ShareGroup, SharePermission, SharePermissionLevel } from '../types'

type TeamPermission = SharePermission & { team: string }

function isTeamPermission(p: SharePermission): p is TeamPermission {
  return !!p.team && !p.entireOrganization
}

interface ShareDialogProps {
  conversationId: string
  isOpen: boolean
  onClose: () => void
}

export default function ShareDialog({ conversationId, isOpen, onClose }: ShareDialogProps) {
  const { strings } = useChatConfig()
  const { common } = useStrings()
  const t = strings.shareConversation
  const { adapter } = useChat()
  const sharing = adapter.sharing
  const [permissions, setPermissions] = useState<SharePermission[]>([])
  const [teams, setTeams] = useState<ShareGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, startSaveTransition] = useTransition()
  const [orgViewAccess, setOrgViewAccess] = useState(false)
  const [orgCollaborateAccess, setOrgCollaborateAccess] = useState(false)

  // Track original permissions to compare for changes
  const [originalPermissions, setOriginalPermissions] = useState<SharePermission[]>([])
  const [originalOrgCollaborateAccess, setOriginalOrgCollaborateAccess] = useState(false)

  // Load current permissions and available teams
  useEffect(() => {
    if (!isOpen || !sharing) {
      return
    }

    const loadData = async () => {
      setLoading(true)
      try {
        const perms = await sharing.listPermissions(conversationId)
        setPermissions(perms)
        setOriginalPermissions([...perms])

        // Check for org-wide permissions
        const orgPerm = perms.find((p) => p.entireOrganization)
        if (orgPerm) {
          setOrgViewAccess(true)
          setOrgCollaborateAccess(orgPerm.permission === 'collaborate')
          setOriginalOrgCollaborateAccess(orgPerm.permission === 'collaborate')
        } else {
          setOrgViewAccess(false)
          setOrgCollaborateAccess(false)
          setOriginalOrgCollaborateAccess(false)
        }

        setTeams(await sharing.listGroups())
      } catch (error) {
        console.error('Failed to load sharing data:', error)
        toast.error(t.loadError)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [isOpen, conversationId, sharing, t.loadError])

  const handleSave = useCallback(() => {
    if (!sharing) {
      return
    }
    startSaveTransition(async () => {
      try {
        // Handle organization permission changes
        const hadOrgPerm = originalPermissions.find((p) => p.entireOrganization)
        const wantOrgPerm = orgViewAccess

        if (wantOrgPerm && !hadOrgPerm) {
          await sharing.addPermission(conversationId, {
            permission: orgCollaborateAccess ? 'collaborate' : 'view',
            entireOrganization: true,
          })
        } else if (!wantOrgPerm && hadOrgPerm?.id) {
          await sharing.removePermission(conversationId, hadOrgPerm.id)
        } else if (
          wantOrgPerm &&
          hadOrgPerm?.id &&
          (originalOrgCollaborateAccess !== orgCollaborateAccess ||
            (hadOrgPerm.permission === 'collaborate') !== orgCollaborateAccess)
        ) {
          await sharing.updatePermission(
            conversationId,
            hadOrgPerm.id,
            orgCollaborateAccess ? 'collaborate' : 'view',
          )
        }

        // Handle team permission changes
        const originalTeamPerms = originalPermissions.filter(isTeamPermission)
        const currentTeamPerms = permissions.filter(isTeamPermission)

        // Find groups to add
        for (const perm of currentTeamPerms) {
          const original = originalTeamPerms.find((p) => p.team === perm.team)
          if (!original) {
            await sharing.addPermission(conversationId, {
              permission: perm.permission,
              team: perm.team,
              entireOrganization: false,
            })
          } else if (original.permission !== perm.permission && original.id) {
            await sharing.updatePermission(conversationId, original.id, perm.permission)
          }
        }

        // Find teams to remove
        for (const original of originalTeamPerms) {
          const stillExists = currentTeamPerms.find((p) => p.team === original.team)
          if (!stillExists && original.id) {
            await sharing.removePermission(conversationId, original.id)
          }
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
        return
      }

      toast.success(t.saveSuccess)
      onClose()
    })
  }, [
    sharing,
    conversationId,
    permissions,
    originalPermissions,
    orgViewAccess,
    orgCollaborateAccess,
    originalOrgCollaborateAccess,
    onClose,
    t.saveSuccess,
  ])

  const handleAddTeam = useCallback(
    (teamId: string) => {
      if (permissions.some((p) => p.team === teamId)) {
        return
      }
      const team = teams.find((candidate) => candidate.id === teamId)
      if (team) {
        setPermissions((prev) => [
          ...prev,
          {
            team: teamId,
            teamName: team.name,
            permission: 'view',
            entireOrganization: false,
          },
        ])
      }
    },
    [teams, permissions],
  )

  const handleRemoveTeam = useCallback((teamId: string) => {
    setPermissions((prev) => prev.filter((p) => p.team !== teamId))
  }, [])

  const handleTeamPermissionChange = useCallback(
    (teamId: string, permission: SharePermissionLevel) => {
      setPermissions((prev) => prev.map((p) => (p.team === teamId ? { ...p, permission } : p)))
    },
    [],
  )

  if (!sharing) {
    return null
  }

  const teamPermissions = permissions.filter(isTeamPermission)
  const permissionItems = [
    { label: t.viewOnly, value: 'view' as const },
    { label: t.canCollaborate, value: 'collaborate' as const },
  ]
  const availableTeams = teams.filter((team) => !permissions.some((p) => p.team === team.id))

  return (
    <ConfirmModal
      open={isOpen}
      onClose={onClose}
      align="center"
      title={t.title}
      confirmLabel={common.save}
      cancelLabel={common.cancel}
      onConfirm={handleSave}
      confirmDisabled={saving}
    >
      <div className="space-y-4">
        {loading ? (
          <div className="py-4">
            <Loader size={24} label={common.loading} />
          </div>
        ) : (
          <>
            {/* Organization-wide access */}
            <div className="border theme-border rounded-lg p-3">
              <h3 className="font-medium text-sm mb-2">{t.orgAccess}</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={orgViewAccess}
                    onCheckedChange={(on) => {
                      setOrgViewAccess(on)
                      if (!on) {
                        setOrgCollaborateAccess(false)
                      }
                    }}
                  />
                  <span className="text-sm">{t.orgCanView}</span>
                </label>
                <label className="flex items-center gap-2 ml-4">
                  <Checkbox
                    checked={orgCollaborateAccess}
                    onCheckedChange={setOrgCollaborateAccess}
                    disabled={!orgViewAccess}
                  />
                  <span className="text-sm">{t.allowCollaboration}</span>
                </label>
              </div>
            </div>

            {/* Group access */}
            <div className="border theme-border rounded-lg p-3">
              <h3 className="font-medium text-sm mb-2">{t.groupAccess}</h3>

              {/* Current team permissions */}
              {teamPermissions.length > 0 ? (
                <ul className="space-y-2 mb-3 max-h-[200px] overflow-y-auto">
                  {teamPermissions.map((perm) => (
                    <li
                      key={perm.team}
                      className="flex items-center justify-between theme-muted-panel rounded px-2 py-1.5"
                    >
                      <span className="text-sm theme-text">{perm.teamName || perm.team}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-40">
                          <Select<SharePermissionLevel>
                            items={permissionItems}
                            value={perm.permission}
                            onValueChange={(level) => {
                              if (level !== null) {
                                handleTeamPermissionChange(perm.team, level)
                              }
                            }}
                            aria-label={perm.teamName || perm.team}
                          />
                        </div>
                        <Tooltip content={common.remove}>
                          <button
                            type="button"
                            onClick={() => handleRemoveTeam(perm.team)}
                            className="p-1 rounded hover:bg-(--theme-error-muted)"
                            aria-label={`${common.remove} ${perm.teamName || perm.team}`}
                          >
                            <TrashIcon className="w-3 h-3 text-(--theme-error)" />
                          </button>
                        </Tooltip>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm theme-muted-text mb-3">{t.noGroups}</p>
              )}

              {/* Add group dropdown */}
              {availableTeams.length > 0 && (
                // Picking a group adds it to the list above, so the field itself stays empty.
                <Combobox
                  items={availableTeams.map((team) => ({ label: team.name, value: team.id }))}
                  value={null}
                  onValueChange={(teamId) => {
                    if (teamId !== null) {
                      handleAddTeam(teamId)
                    }
                  }}
                  placeholder={t.addGroups}
                  aria-label={t.addGroups}
                />
              )}
            </div>

            {/* Info text */}
            <p className="text-xs theme-muted-text">{t.info}</p>
          </>
        )}
      </div>
    </ConfirmModal>
  )
}

// Export a button component for easy integration
export function ShareButton({
  conversationId,
  disabled = false,
}: {
  conversationId: string
  disabled?: boolean
}) {
  const { strings } = useChatConfig()
  const { adapter, tools } = useChat()
  const [isOpen, setIsOpen] = useState(false)
  const shared = useShared(conversationId, tools.length > 0 && !isOpen)

  if (!adapter.sharing) {
    return null
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] theme-muted-text transition-colors hover:theme-muted-panel hover:theme-text disabled:opacity-50"
        title={strings.shareConversation.shareButton}
      >
        <ShareIcon className="h-3 w-3" />
        {strings.shareConversation.shareButton}
      </button>
      {shared && <ToolResultsSharedNote />}
      <ShareDialog
        conversationId={conversationId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  )
}

/** Says that tool results in a shared conversation are visible to the
 *  people it is shared with. */
export function ToolResultsSharedNote() {
  const { strings } = useChatConfig()
  return (
    <span className="text-[11px] theme-muted-text">
      {strings.shareConversation.toolResultsShared}
    </span>
  )
}

/** Whether anyone else can read the conversation, checked while `check` is
 *  true: tool results in it are visible to them. */
function useShared(conversationId: string, check: boolean): boolean {
  const { adapter } = useChat()
  const sharing = adapter.sharing
  const [shared, setShared] = useState(false)
  useEffect(() => {
    if (!check || !sharing) {
      return
    }
    let current = true
    sharing.listPermissions(conversationId).then(
      (permissions) => {
        if (current) {
          setShared(permissions.length > 0)
        }
      },
      () => {},
    )
    return () => {
      current = false
    }
  }, [conversationId, check, sharing])
  return shared
}

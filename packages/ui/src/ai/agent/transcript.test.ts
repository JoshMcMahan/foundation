import {
  askQuestionsFromArgs,
  hiddenTranscriptTool,
  INTERRUPTED_NOTICE,
  interruptionNotice,
  parseSubagentNotice,
  subagentDeliveryLine,
  taskCallFromArgs,
} from './transcript'

describe('interruptionNotice', () => {
  it("reads the user's stop as the live notice does", () => {
    expect(interruptionNotice('[Request interrupted by the user.]\n')).toBe(INTERRUPTED_NOTICE)
  })

  it('reads a stop the user did not make with the reason the daemon gave', () => {
    expect(interruptionNotice('[Request interrupted because the server stopped.]')).toBe(
      'Request interrupted because the server stopped.',
    )
    expect(interruptionNotice('[Request interrupted because its deadline expired.]')).toBe(
      'Request interrupted because its deadline expired.',
    )
  })

  it("leaves the model's own words alone", () => {
    expect(interruptionNotice('Request interrupted by the user.')).toBeNull()
    expect(interruptionNotice('[Request interrupted] the build, then retried it.')).toBeNull()
    expect(interruptionNotice('Done.')).toBeNull()
  })
})

describe('taskCallFromArgs', () => {
  it('prefers the description and drops the default agent type', () => {
    expect(
      taskCallFromArgs(
        '{"description":"Inventory routes","prompt":"long prompt","subagent_type":"default"}',
      ),
    ).toEqual({ description: 'Inventory routes', agentType: '' })
  })

  it('falls back to the clipped prompt', () => {
    const prompt = 'x'.repeat(60)
    expect(taskCallFromArgs(`{"prompt":"${prompt}"}`).description).toBe(`${'x'.repeat(37)}...`)
    expect(taskCallFromArgs('not json').description).toBe('')
  })
})

describe('parseSubagentNotice', () => {
  it('reads a completed report and clips its first line', () => {
    const n = parseSubagentNotice(
      '[Background subagent task-4 (Inventory (routes)) completed]\n\nKey finding: none.\n(pass task-4 as task_id to send it direction)',
    )
    expect(n).toEqual({
      id: 'task-4',
      description: 'Inventory (routes)',
      preview: 'Key finding: none.',
      body: 'Key finding: none.',
      interim: false,
      silent: false,
      failed: false,
      elapsedMs: 0,
    })
    expect(subagentDeliveryLine(n!)).toBe('Agent "Inventory (routes)" finished')
  })

  it('says how long an agent ran and whether it failed', () => {
    const failed = parseSubagentNotice(
      '[Background subagent task-5 (Audit) failed after 2m59.4s]\nNo access.',
    )
    expect(failed).toMatchObject({ failed: true, elapsedMs: 179_400, body: 'No access.' })
    expect(subagentDeliveryLine(failed!)).toBe('Agent "Audit" failed · 2m 59s')
    expect(
      subagentDeliveryLine(
        parseSubagentNotice('[Background subagent task-6 () completed after 850ms]')!,
      ),
    ).toBe('Agent "task-6" finished · 1s')
  })

  it('marks an interim message and an interrupted child', () => {
    const interim = parseSubagentNotice(
      '[Message from subagent task-3 (Coverage) — it is still working]\nHalf way.',
    )
    expect(interim?.interim).toBe(true)
    expect(subagentDeliveryLine(interim!)).toBe('Message from Coverage')
    expect(
      parseSubagentNotice(
        '[Background subagent task-1 (x) was interrupted by the user and returned no result]\n(pass task-1 as task_id to resume it)',
      )?.silent,
    ).toBe(true)
  })

  it('reads a background command exit and ignores other notices', () => {
    const failed = parseSubagentNotice('[Background command bash-2 (npm test) exited with code 1]')
    expect(failed).toMatchObject({ id: 'bash-2', shell: true, exitCode: 1 })
    expect(subagentDeliveryLine(failed!)).toBe(
      'Background command "npm test" failed with exit code 1',
    )
    expect(
      subagentDeliveryLine(
        parseSubagentNotice('[Background command bash-3 (ls) exited with code 0]')!,
      ),
    ).toBe('Background command "ls" completed (exit code 0)')
    expect(
      parseSubagentNotice('[Background command bash-4 (sleep 9) was stopped by the user]')?.silent,
    ).toBe(true)
    expect(parseSubagentNotice('Goal set: ship it')).toBeNull()
  })
})

describe('askQuestionsFromArgs', () => {
  it('reads every question a call asked', () => {
    const args = JSON.stringify({
      questions: [
        {
          question: 'Which db?',
          header: 'Database',
          options: [
            { label: 'Postgres', description: 'Relational', preview: 'CREATE TABLE runs ()' },
            { label: 'Mongo' },
          ],
        },
        { question: 'Which checks?', multiSelect: true, options: [{ label: 'Lint' }] },
        { question: 'Anything else?' },
      ],
    })
    expect(askQuestionsFromArgs(args)).toEqual([
      {
        question: 'Which db?',
        header: 'Database',
        options: [
          { label: 'Postgres', description: 'Relational', preview: 'CREATE TABLE runs ()' },
          { label: 'Mongo' },
        ],
      },
      { question: 'Which checks?', multiSelect: true, options: [{ label: 'Lint' }] },
      { question: 'Anything else?' },
    ])
  })

  it('reads the one question a call made before several per call', () => {
    const args = JSON.stringify({ question: 'Which db?', options: [{ label: 'Postgres' }] })
    expect(askQuestionsFromArgs(args)).toEqual([
      { question: 'Which db?', options: [{ label: 'Postgres' }] },
    ])
  })

  it('skips what is not a question or an option', () => {
    const args = JSON.stringify({
      questions: [
        { question: 'Which db?', multiSelect: 'yes', options: [{ label: 1 }, 'Mongo'] },
        { header: 'No question' },
        null,
      ],
    })
    expect(askQuestionsFromArgs(args)).toEqual([{ question: 'Which db?' }])
    expect(askQuestionsFromArgs('not json')).toEqual([])
  })
})

describe('hiddenTranscriptTool', () => {
  it('hides the tools whose output has its own surface', () => {
    expect(hiddenTranscriptTool('TodoWrite')).toBe(true)
    expect(hiddenTranscriptTool('ExitPlanMode')).toBe(true)
    expect(hiddenTranscriptTool('Bash')).toBe(false)
  })
})

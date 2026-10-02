import deepEqual from 'fast-deep-equal'
import {
  enforceOneMustBeTrue,
  flattenGroups,
  impureSetValueFromPath,
  initializeValues,
} from './lib'

const MockSchema = {
  group1: {
    type: 'group',
    label: 'group1',
    options: {
      innerField: {
        type: 'string',
        label: 'field1',
      },
    },
  },
  objField: {
    type: 'object',
    label: 'object',
    options: {
      objInnerField: {
        type: 'string',
        label: 'field1',
      },
      innerGroup: {
        type: 'group',
        label: 'group1',
        options: {
          innerField2: {
            type: 'string',
            label: 'field2',
          },
        },
      },
    },
  },
  outerField: {
    type: 'number',
    label: 'field2',
  },
}

describe('flattenGroups', () => {
  it('should flatten schema', () => {
    const expectedResult1 = {
      innerField: {
        type: 'string',
        label: 'field1',
      },
      objField: {
        objInnerField: {
          type: 'string',
          label: 'field1',
        },
        innerField2: {
          type: 'string',
          label: 'field2',
        },
      },
      outerField: {
        type: 'number',
        label: 'field2',
      },
    }

    const result = flattenGroups(MockSchema)

    expect(result).toEqual(expectedResult1)
  })
})

describe('impureSetValueFromPath', () => {
  it('sets a top-level value', () => {
    const obj: Record<string, unknown> = {}
    impureSetValueFromPath(obj, 'name', 'x')
    expect(obj).toEqual({ name: 'x' })
  })

  it('creates intermediate objects for a nested dotted path', () => {
    const obj: Record<string, unknown> = {}
    impureSetValueFromPath(obj, 'a.b.c', 5)
    expect(obj).toEqual({ a: { b: { c: 5 } } })
  })

  it('writes into an existing array element for a bracketed segment', () => {
    const obj: Record<string, unknown> = { disks: [{ name: 'd0' }] }
    impureSetValueFromPath(obj, 'disks[0].size', 100)
    expect(obj).toEqual({ disks: [{ name: 'd0', size: 100 }] })
  })

  it('creates the array and element for a bracketed segment', () => {
    const obj: Record<string, unknown> = {}
    impureSetValueFromPath(obj, 'disks[0].secret', 'shh')
    expect(obj).toEqual({ disks: [{ secret: 'shh' }] })
  })
})

const input = {
  multi_user: false,
  provider_version: '',
  health_check: 'echo "alskdjflk"\n\nexit(1)',
  cluster_config: {
    architecture: 'amd64',
    controller_GVNIC: false,
    controller_image: 'latest',
    controller_tier_1: false,
    export_fs_type: 'ext4',
    image_disk_count: '0',
    image_disk_name: 'someImageDisk',
    image_disk_size_gb: '200',
    management_shape: 'c2-standard-4',
    migrate_on_maintenance: false,
    partition_config: [
      {
        architecture: 'amd64',
        default: 'YES',
        elastic_image: 'latest',
        enable_spot: false,
        gvnic: true,
        instance_type: 'c2-standard-4',
        max_node_num: 5,
        migrate_on_maintenance: true,
        name: 'batch',
        tier_1: false,
        zone: 'us-central1-a',
      },
      {
        architecture: 'amd64',
        elastic_image: 'latest',
        enable_spot: false,
        gvnic: true,
        instance_type: 'c2-standard-8',
        max_node_num: 5,
        migrate_on_maintenance: true,
        name: 'compute',
        tier_1: false,
        zone: 'us-central1-a',
        default: 'NO',
      },
    ],
    region: 'us-central1',
    slurm_resume_timeout: '',
    slurm_return_to_service: '',
    slurm_suspend_time: '',
    slurm_suspend_timeout: '',
    zone: 'us-central1-c',
  },
  storages: [
    {
      storage: '642c94f08da9804230ba317b',
      mountPoint: '/persistent',
    },
  ],
}

const input2 = {
  access_public_key: undefined,
  cluster_config: {
    partition_config: [
      {
        architecture: 'amd64',
        elastic_image: 'latest',
        enable_spot: false,
        gvnic: true,
        instance_type: 'c2-standard-4',
        max_node_num: 5,
        migrate_on_maintenance: true,
        name: 'batch',
        tier_1: false,
        zone: 'us-central1-a',
        default: 'YES',
      },
      {
        architecture: 'amd64',
        elastic_image: 'latest',
        enable_spot: false,
        gvnic: true,
        instance_type: 'c2-standard-8',
        max_node_num: 5,
        migrate_on_maintenance: true,
        name: 'compute',
        tier_1: false,
        zone: 'us-central1-a',
      },
    ],
  },
  health_check: undefined,
  multi_user: false,
  project: undefined,
  provider_version: '',
  resource_account: undefined,
  storages: [],
  user_bootstrap: undefined,
}

describe('initializeValues', () => {
  it('blanks only the defaults the host predicate selects', () => {
    const values = initializeValues(
      {
        note: { type: 'textarea', default: '${{ inputs.x }}' },
        count: { type: 'number', default: 2 },
      },
      {},
      (field) => field.type === 'textarea',
    )
    expect(values).toEqual({ note: '', count: 2 })
  })

  it('should initialize values', () => {
    const result = initializeValues(getSampleOptions(), input)
    const expectedResult = {
      ...input,
      access_public_key: '',
      project: 'Owners',
      resource_account: 'Example GCP (Platform)',
      user_bootstrap:
        '# (optional) User-specific master node bootstrap script - \n# you can use this to automatically execute a set of commands \n# (run with your uid) upon cluster start',
    }
    expect(result).toEqual(expectedResult)
  })

  it('should initialize values with empty values', () => {
    const result = initializeValues(getSampleOptions(), input2)
    const expectedResult = {
      user_bootstrap:
        '# (optional) User-specific master node bootstrap script - \n# you can use this to automatically execute a set of commands \n# (run with your uid) upon cluster start',
      multi_user: false,
      provider_version: '',
      project: 'Owners',
      access_public_key: '',
      resource_account: 'Example GCP (Platform)',
      health_check:
        '# (optional) User-specific master node Health Check script - \n# you can use this run custom node Health Check logic  upon cluster start',
      cluster_config: {
        region: 'us-central1',
        zone: '',
        management_shape: '',
        controller_image: 'latest',
        image_disk_name: '',
        export_fs_type: '',
        image_disk_count: '',
        image_disk_size_gb: '',
        controller_GVNIC: false,
        controller_tier_1: false,
        migrate_on_maintenance: true,
        partition_config: [
          {
            architecture: 'amd64',
            elastic_image: 'latest',
            enable_spot: false,
            gvnic: true,
            instance_type: 'c2-standard-4',
            max_node_num: 5,
            migrate_on_maintenance: true,
            name: 'batch',
            tier_1: false,
            zone: 'us-central1-a',
            default: 'YES',
          },
          {
            architecture: 'amd64',
            elastic_image: 'latest',
            enable_spot: false,
            gvnic: true,
            instance_type: 'c2-standard-8',
            max_node_num: 5,
            migrate_on_maintenance: true,
            name: 'compute',
            tier_1: false,
            zone: 'us-central1-a',
            default: 'NO',
          },
        ],
        slurm_suspend_time: '',
        slurm_resume_timeout: '',
        slurm_suspend_timeout: '',
        slurm_return_to_service: '',
      },
      storages: [],
    }
    expect(result).toEqual(expectedResult)
  })

  it('restores secondary values for persisted grouped storage selections', () => {
    const schema = {
      attachedStorages: {
        type: 'list',
        options: {
          storage: {
            type: 'storage',
            secondaryField: ['storageType', 'readOnly', 'bucketAccessWritable'],
            options: [
              {
                category: 'Buckets',
                options: [
                  {
                    value: 'writable-bucket',
                    secondaryValue: ['aws-bucket', false, true],
                  },
                  {
                    value: 'read-only-bucket',
                    secondaryValue: ['aws-bucket', true, false],
                  },
                ],
              },
            ],
          },
          mountPoint: { type: 'string' },
          readOnly: { type: 'bucket-read-only', default: false },
        },
      },
    }
    const result = initializeValues(schema, {
      attachedStorages: [
        {
          storage: 'writable-bucket',
          mountPoint: '/writable',
          readOnly: true,
        },
        {
          storage: 'read-only-bucket',
          mountPoint: '/forced-read-only',
          readOnly: true,
        },
      ],
    })

    expect(result?.['attachedStorages']).toEqual([
      {
        storage: 'writable-bucket',
        storageType: 'aws-bucket',
        bucketAccessWritable: true,
        mountPoint: '/writable',
        readOnly: true,
      },
      {
        storage: 'read-only-bucket',
        storageType: 'aws-bucket',
        bucketAccessWritable: false,
        mountPoint: '/forced-read-only',
        readOnly: true,
      },
    ])
  })
})

function getSampleOptions() {
  return {
    general_settings: {
      type: 'group',
      label: 'General Settings',
      options: {
        provider_version: {
          disabled: false,
          label: 'Provider Version',
          type: 'string',
          hidden: false,
        },
        resource_account: {
          disabled: false,
          label: 'Auth Method',
          type: 'dropdown',
          options: [
            {
              label: 'Example GCP (Platform)',
              value: 'Example GCP (Platform)',
            },
            { label: 'Example GCP', value: 'Example GCP' },
            {
              label: 'Example GCP (sample-project-123456)',
              value: 'Example GCP (sample-project-123456)',
            },
          ],
          sensitive: true,
        },
        project: {
          disabled: false,
          label: 'Group',
          type: 'dropdown',
          sensitive: true,
          options: [
            { label: 'Owners', value: 'Owners' },
            { label: 'google-contrib', value: 'google-contrib' },
            { label: 'aws-contrib', value: 'aws-contrib' },
            { label: 'azure-main', value: 'azure-main' },
            { label: 'cg-test', value: 'cg-test' },
          ],
        },
        multi_user: {
          disabled: false,
          label: 'Multi User',
          type: 'boolean',
        },
        access_public_key: {
          disabled: false,
          label: 'Access Public Key',
          type: 'textarea',
          sensitive: true,
          placeholder: '(Optional) Public key for remote access',
        },
      },
    },
    group: {
      type: 'group',
      label: 'Scripts',
      options: {
        user_bootstrap: {
          disabled: false,
          label: 'User Bootstrap',
          type: 'editor',
          default:
            '# (optional) User-specific master node bootstrap script - \n# you can use this to automatically execute a set of commands \n# (run with your uid) upon cluster start',
          options: { language: 'shell' },
          sensitive: true,
        },
        health_check: {
          disabled: false,
          label: 'Health Check',
          type: 'editor',
          default:
            '# (optional) User-specific master node Health Check script - \n# you can use this run custom node Health Check logic  upon cluster start',
          langauge: 'shell',
        },
      },
    },
    cluster_config: {
      type: 'object',
      label: 'Controller Settings',
      options: {
        region: {
          label: 'Region',
          disabled: false,
          type: 'dropdown',
          options: [
            'us-central1',
            'us-east1',
            'us-east4',
            'us-west1',
            'us-west2',
            'us-west3',
            'us-west4',
          ],
          default: 'us-central1',
        },
        zone: {
          depends_on: 'cluster_config.region',
          disabled: false,
          label: 'Zone',
          type: 'dropdown',
          options: {
            'us-central1': ['us-central1-a', 'us-central1-b', 'us-central1-c', 'us-central1-f'],
            'us-east1': ['us-east1-b', 'us-east1-c', 'us-east1-d'],
            'us-east4': ['us-east4-a', 'us-east4-b', 'us-east4-c'],
            'us-west1': ['us-west1-a', 'us-west1-b', 'us-west1-c'],
            'us-west2': ['us-west2-a', 'us-west2-b', 'us-west2-c'],
            'us-west3': ['us-west3-a', 'us-west3-b', 'us-west3-c'],
            'us-west4': ['us-west4-a', 'us-west4-b', 'us-west4-c'],
          },
        },
        management_shape: {
          label: 'Instance Type',
          disabled: false,
          type: 'dropdown',
          options: {
            'us-central1': [
              {
                value: 'a2-highgpu-1g',
                label: 'a2-highgpu-1g (12 vCPUs, 85 GB Memory, amd64)',
                secondaryValue: 'amd64',
              },
              {
                value: 'a2-highgpu-2g',
                label: 'a2-highgpu-2g (24 vCPUs, 170 GB Memory, amd64)',
                secondaryValue: 'amd64',
              },
            ],
          },
          depends_on: 'cluster_config.region',
        },
        controller_image: {
          label: 'Image',
          disabled: false,
          type: 'dropdown',
          options: [
            { label: 'Latest', value: 'latest' },
            {
              label: 'Example hpc-c7-x86-64-v27-slurm',
              value: 'projects/example-images/global/images/hpc-c7-x86-64-v27-slurm',
            },
            { label: 'new-gcp', value: 'demo-new-gcp' },
            { label: 'testing-cloud', value: 'demo-testing-cloud' },
            {
              label: 'hpc-c7-x86-64-v31-slurm',
              value: 'projects/example-images/global/images/hpc-c7-x86-64-v31-slurm',
            },
          ],
          tooltip: [
            'The OS image assigned to the instance. Latest denotes the most recent base image.',
            'Custom cloud snapshots can also be assigned here.',
          ],
        },
        google_image_label: { type: 'label', label: 'Image Disk Settings' },
        image_disk_name: {
          label: 'Image Disk Name',
          disabled: false,
          type: 'dropdown',
          options: {
            'us-central1': [
              {
                label: '/apps',
                value: 'projects/modular-magpie-167320/global/images/apps-08-image',
                secondaryValue: 'ext4',
              },
            ],
          },
          depends_on: 'cluster_config.region',
          secondaryField: 'export_fs_type',
        },
        export_fs_type: { type: 'string', disabled: false, hidden: true },
        image_disk_count: {
          label: 'Image Disks',
          disabled: false,
          type: 'number',
        },
        image_disk_size_gb: {
          label: 'Image Disk Size GB',
          disabled: false,
          type: 'number',
        },
        google_label: { type: 'label', label: 'Google Specific Settings' },
        controller_GVNIC: {
          label: 'GVNIC',
          disabled: false,
          type: 'boolean',
          default: false,
          tooltip: [
            'GVNIC is required to support higher network bandwidths, such as 50-100 Gbps, but is not supported on all VM types.',
          ],
        },
        controller_tier_1: {
          label: 'TIER_1',
          disabled: false,
          type: 'boolean',
          tooltip: [
            'TIER_1 increases maximum egress bandwith to 50 - 100 Gbps depending on the size of the instance.',
            'If set to false it will range from 10 - 32 Gbps.',
            'GVNIC must be enabled to use Tier 1 Networking.',
          ],
        },
        migrate_on_maintenance: {
          type: 'boolean',
          disabled: false,
          label: 'Migrate on Maintenance',
          default: true,
          tooltip: [
            'Does a live migration whenever the VMs host goes under maintenance.',
            'This ensures instance is up during maintenance.',
            'GPU and spot instances cannot be live migrated.',
          ],
        },
        partition_config: {
          type: 'list',
          label: 'Partition',
          options: {
            name: { label: 'Name', disabled: false, type: 'string' },
            instance_type: {
              label: 'Instance Type',
              disabled: false,
              type: 'dropdown',
              depends_on: 'cluster_config.region',
              options: {
                'us-central1': [
                  {
                    value: 'a2-highgpu-1g',
                    label: 'a2-highgpu-1g (12 vCPUs, 85 GB Memory, amd64)',
                    secondaryValue: 'amd64',
                  },
                  {
                    value: 'a2-highgpu-2g',
                    label: 'a2-highgpu-2g (24 vCPUs, 170 GB Memory, amd64)',
                    secondaryValue: 'amd64',
                  },
                ],
              },
              secondaryField: 'architecture',
            },
            max_node_num: {
              label: 'Max Nodes',
              disabled: false,
              type: 'number',
            },
            default: {
              label: 'Default',
              disabled: false,
              type: 'boolean',
              options: { offOption: 'NO', onOption: 'YES' },
              one_must_be_true: true,
            },
            enable_spot: {
              label: 'Spot',
              disabled: false,
              type: 'boolean',
            },
            elastic_image: {
              label: 'Elastic Image',
              disabled: false,
              type: 'dropdown',
              options: [
                { label: 'Latest', value: 'latest' },
                {
                  label: 'Example hpc-c7-x86-64-v27-slurm',
                  value: 'projects/example-images/global/images/hpc-c7-x86-64-v27-slurm',
                },
                { label: 'new-gcp', value: 'demo-new-gcp' },
                { label: 'testing-cloud', value: 'demo-testing-cloud' },
                {
                  label: 'hpc-c7-x86-64-v31-slurm',
                  value: 'projects/example-images/global/images/hpc-c7-x86-64-v31-slurm',
                },
              ],
              tooltip: [
                'The OS image assigned to the instance. Latest denotes the most recent base image.',
                'Custom cloud snapshots can also be assigned here.',
              ],
            },
            zone: {
              label: 'Zone',
              disabled: false,
              type: 'dropdown',
              depends_on: 'cluster_config.region',
              options: {
                'us-central1': ['us-central1-a', 'us-central1-b', 'us-central1-c', 'us-central1-f'],
                'us-east1': ['us-east1-b', 'us-east1-c', 'us-east1-d'],
                'us-east4': ['us-east4-a', 'us-east4-b', 'us-east4-c'],
                'us-west1': ['us-west1-a', 'us-west1-b', 'us-west1-c'],
                'us-west2': ['us-west2-a', 'us-west2-b', 'us-west2-c'],
                'us-west3': ['us-west3-a', 'us-west3-b', 'us-west3-c'],
                'us-west4': ['us-west4-a', 'us-west4-b', 'us-west4-c'],
              },
            },
            google_label: {
              type: 'label',
              label: 'Google Specific Settings',
            },
            gvnic: {
              label: 'GVNIC',
              type: 'boolean',
              disabled: false,
              default: true,
              tooltip: ['GVNIC is required to support higher network bandwidths.'],
            },
            tier_1: {
              label: 'TIER_1',
              disabled: false,
              type: 'boolean',
              tooltip: [
                'TIER_1 increases maximum egress bandwith to 50 - 100 Gbps depending on the size of the instance.',
                'If set to false it will range from 10 - 32 Gbps.',
                'GVNIC must be enabled to use TIER_1.',
              ],
            },
            migrate_on_maintenance: {
              type: 'boolean',
              disabled: false,
              label: 'Migrate on Maintenance',
              default: true,
              tooltip: [
                'Does a live migration whenever VMs host goes under maintenance. This ensures the VM remains up during maintenance.',
                'GPU and spot instances cannot be live migrated.',
              ],
            },
            architecture: { type: 'string', hidden: true },
          },
        },
        scheduler_settings: {
          type: 'group',
          label: 'Slurm Settings',
          options: {
            slurm_suspend_time: {
              disabled: false,
              label: 'Suspend Time',
              type: 'number',
              tooltip: ['How long to wait before shutting down idle nodes.'],
              placeholder: 300,
            },
            slurm_resume_timeout: {
              label: 'Resume Timeout',
              disabled: false,
              type: 'number',
              tooltip: ['Max time to wait for nodes to start before giving up.'],
              placeholder: 1200,
            },
            slurm_suspend_timeout: {
              label: 'Suspend Timeout',
              disabled: false,
              type: 'number',
              tooltip: ['How long to wait for a node to be ready again after being shutdown.'],
              placeholder: 300,
            },
            slurm_return_to_service: {
              label: 'Return to Service',
              disabled: false,
              type: 'dropdown',
              options: [
                { label: 'Non Responsive (default)', value: '' },
                { label: 'Any Reason', value: 2 },
              ],
              tooltip: [
                'Determines how DOWN nodes are returned to service.',
                'Non Responsive: A DOWN node will become available if it was set DOWN due to being non-responsive. If the node was set DOWN for any other reason (low memory, unexpected reboot, etc.), its state will not automatically be changed.',
                'Any Reason: A DOWN node will become available for use if it was set DOWN for any reason.',
              ],
              default: '',
            },
          },
        },
      },
    },
    storages: {
      type: 'list',
      label: 'Attached Storage',
      options: {
        storage: {
          label: 'Storage',
          type: 'dropdown',
          options: [
            {
              label: 'googlepersistentlustre',
              value: '642c94f08da9804230ba317b',
            },
            {
              label: 'googleephemerallustre',
              value: '644957ad961be21a9f07ba77',
            },
            {
              label: 'canary-google-slurm-lustre',
              value: '64627e0d98e3b86fe099173d',
            },
          ],
        },
        mountPoint: { label: 'Mount Point', type: 'string' },
      },
    },
  }
}

describe('prefillDefault', () => {
  it('should initialize string field with default when prefillDefault is true', () => {
    const schema = {
      myField: {
        type: 'string',
        label: 'My Field',
        default: '__HOME__',
        prefillDefault: true,
      },
    }
    const result = initializeValues(schema, {})
    expect(result?.['myField']).toBe('__HOME__')
  })

  it('should initialize to empty string when prefillDefault is true but no default', () => {
    const schema = {
      myField: {
        type: 'string',
        label: 'My Field',
        prefillDefault: true,
      },
    }
    const result = initializeValues(schema, {})
    expect(result?.['myField']).toBe('')
  })

  it('should preserve existing data when prefillDefault is true', () => {
    const schema = {
      myField: {
        type: 'string',
        label: 'My Field',
        default: '__HOME__',
        prefillDefault: true,
      },
    }
    const result = initializeValues(schema, { myField: '/custom/path' })
    expect(result?.['myField']).toBe('/custom/path')
  })

  it('should not prefill when prefillDefault is not set', () => {
    const schema = {
      myField: {
        type: 'string',
        label: 'My Field',
        default: '__HOME__',
      },
    }
    const result = initializeValues(schema, {})
    expect(result?.['myField']).toBe('')
  })

  it('should not change initialization for fields without prefillDefault', () => {
    const storageSchema = {
      storage: {
        type: 'dropdown',
        label: 'Storage',
        options: [
          { label: 'Storage A', value: 'storage-a' },
          { label: 'Storage B', value: 'storage-b' },
        ],
      },
      mountPoint: {
        type: 'string',
        label: 'Mount Point',
      },
    }
    const result = initializeValues(storageSchema, {})
    // dropdown gets first option, string gets ''
    expect(result?.['storage']).toBe('storage-a')
    expect(result?.['mountPoint']).toBe('')
  })
})

describe('enforceOneMustBeTrue', () => {
  const schemaWithOnOffOptions = {
    default: {
      label: 'Default',
      type: 'boolean',
      options: { offOption: 'NO', onOption: 'YES' },
      one_must_be_true: true,
    },
  }

  const schemaWithBareOptions = {
    schedule_job: {
      label: 'Schedule Job',
      type: 'boolean',
      options: {},
      one_must_be_true: true,
    },
  }

  it('promotes the last item when no item has the trueOption and promoteIndex is last', () => {
    const items = [
      { name: 'a', schedule_job: false },
      { name: 'b', schedule_job: false },
    ]
    const result = enforceOneMustBeTrue(items, schemaWithBareOptions, 1)
    expect(result[0]!['schedule_job']).toBe(false)
    expect(result[1]!['schedule_job']).toBe(true)
  })

  it('promotes val[0] when no item has the trueOption and promoteIndex is 0', () => {
    const items = [
      { name: 'a', schedule_job: false },
      { name: 'b', schedule_job: false },
    ]
    const result = enforceOneMustBeTrue(items, schemaWithBareOptions, 0)
    expect(result[0]!['schedule_job']).toBe(true)
    expect(result[1]!['schedule_job']).toBe(false)
  })

  it('does not mutate when some item already has the trueOption', () => {
    const items = [
      { name: 'a', schedule_job: true },
      { name: 'b', schedule_job: false },
    ]
    const result = enforceOneMustBeTrue(items, schemaWithBareOptions, 1)
    expect(result[0]!['schedule_job']).toBe(true)
    expect(result[1]!['schedule_job']).toBe(false)
  })

  it('respects onOption/offOption string values from the field schema', () => {
    const items = [
      { name: 'batch', default: 'NO' },
      { name: 'compute', default: 'NO' },
    ]
    const result = enforceOneMustBeTrue(items, schemaWithOnOffOptions, 1)
    expect(result[0]!['default']).toBe('NO')
    expect(result[1]!['default']).toBe('YES')
  })

  it('does not mutate when some item already has onOption', () => {
    const items = [
      { name: 'batch', default: 'YES' },
      { name: 'compute', default: 'NO' },
    ]
    const result = enforceOneMustBeTrue(items, schemaWithOnOffOptions, 1)
    expect(result[0]!['default']).toBe('YES')
    expect(result[1]!['default']).toBe('NO')
  })

  it('is a no-op on an empty list', () => {
    const items: Array<Record<string, unknown>> = []
    const result = enforceOneMustBeTrue(items, schemaWithBareOptions, 0)
    expect(result).toEqual([])
  })

  it('promotes a plain boolean field that has no options key', () => {
    const schemaWithoutOptions = {
      default: {
        label: 'Default Partition',
        type: 'boolean',
        one_must_be_true: true,
      },
    }
    const items = [{ name: 'compute', default: false }]
    const result = enforceOneMustBeTrue(items, schemaWithoutOptions, 0)
    expect(result[0]!['default']).toBe(true)
  })
})

describe('deepEqual', () => {
  it('should not find two array with same length equal', () => {
    const arr1 = [1, 2, 3]
    const arr2 = [2, 3, 4]
    const result = deepEqual(arr1, arr2)
    expect(result).toBe(false)
  })
  it('should find two array with same elements equal', () => {
    const arr1 = [1, 2, 3]
    const arr2 = [1, 2, 3]
    const result = deepEqual(arr1, arr2)
    expect(result).toBe(true)
  })
  it('should find two array with different length not equal', () => {
    const arr1 = [1, 2, 3]
    const arr2 = [1, 2]
    const result = deepEqual(arr1, arr2)
    expect(result).toBe(false)
  })
  it('should find two objects with same keys and values equal', () => {
    const obj1 = { a: 1, b: 2, c: 3 }
    const obj2 = { a: 1, b: 2, c: 3 }
    const result = deepEqual(obj1, obj2)
    expect(result).toBe(true)
  })
  it('should find two objects with different keys not equal', () => {
    const obj1 = { a: 1, b: 2, c: 3 }
    const obj2 = { a: 1, b: 2, d: 3 }
    const result = deepEqual(obj1, obj2)
    expect(result).toBe(false)
  })
  it('should find two objects with same keys but different values not equal', () => {
    const obj1 = { a: 1, b: 2, c: 3 }
    const obj2 = { a: 1, b: 2, c: 4 }
    const result = deepEqual(obj1, obj2)
    expect(result).toBe(false)
  })
  it('should find two objects with different types not equal', () => {
    const obj1 = [{ label: 'test', value: 'test' }]
    const obj2 = [{ current: null }]
    const result = deepEqual(obj1, obj2)
    expect(result).toBe(false)
  })
})

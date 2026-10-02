'use client'

import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'

const INPUT =
  'rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary'

export function CreateListDialog({
  onCreated,
  onClose,
}: {
  onCreated: (id: string) => void
  onClose: () => void
}) {
  const [listName, setListName] = useState('')
  const [customFields, setCustomFields] = useState('')
  const [error, setError] = useState<string>()

  async function createList() {
    setError(undefined)
    const result = await window.api.invoke('contactList:create', {
      name: listName,
      customFields: customFields
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f !== ''),
    })
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    onCreated(result.data.id)
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Create New List"
      testId="create-list-dialog"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void createList()}
            data-testid="submit-list"
          >
            Create List
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="list-name" className="text-xs font-semibold text-ink">
            List Name
          </label>
          <input
            id="list-name"
            data-testid="list-name"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            placeholder="e.g., Leads, Customers"
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="list-fields" className="text-xs font-semibold text-ink">
            Custom Fields (comma-separated)
          </label>
          <input
            id="list-fields"
            data-testid="list-fields"
            value={customFields}
            onChange={(e) => setCustomFields(e.target.value)}
            placeholder="e.g., Company, Status, Notes"
            className={INPUT}
          />
          <p className="text-xs text-ink-subtle">
            Name and Mobile are always included. Custom fields become merge tags.
          </p>
        </div>
        {error && (
          <p className="text-xs text-danger" role="alert" data-testid="list-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

export function AddContactDialog({
  listId,
  fields,
  onAdded,
  onClose,
}: {
  listId: string
  fields: string[]
  onAdded: () => void
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>()

  async function addContact() {
    setError(undefined)
    const result = await window.api.invoke('contacts:create', { listId, data: values })
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    onAdded()
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add Contact"
      testId="add-contact-dialog"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void addContact()}
            data-testid="submit-contact"
          >
            Add Contact
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          <div key={field} className="flex flex-col gap-1.5">
            <label htmlFor={`field-${field}`} className="text-xs font-semibold text-ink">
              {field}
            </label>
            <input
              id={`field-${field}`}
              data-testid={`field-${field}`}
              value={values[field] ?? ''}
              onChange={(e) =>
                setValues((current) => ({ ...current, [field]: e.target.value }))
              }
              className={INPUT}
            />
          </div>
        ))}
        {error && (
          <p className="text-xs text-danger" role="alert" data-testid="contact-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

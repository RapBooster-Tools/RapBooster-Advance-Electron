'use client'

/**
 * Pick a product from a connected WhatsApp Business device's catalog.
 *
 * The template stores a snapshot of the product (shared/rich-message.ts), so a
 * campaign still sends the card when the catalog cannot be fetched later.
 */
import { useState } from 'react'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'
import type { ProductPayload } from '@shared/rich-message'
import { INPUT_CLASS } from './rich-fields'

type Product = IpcResponse<'catalog:list'>[number]

function isUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    // Not a URL: the snapshot simply goes without an image.
    return false
  }
}

/** Only fields the payload schema accepts, so a quirky catalog entry cannot block saving. */
function toSnapshot(deviceId: string, product: Product): ProductPayload {
  return {
    deviceId,
    productId: product.id,
    title: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(product.priceAmount1000 !== null
      ? { priceAmount1000: product.priceAmount1000 }
      : {}),
    ...(product.currency && product.currency.length === 3
      ? { currency: product.currency }
      : {}),
    ...(product.imageUrl && isUrl(product.imageUrl)
      ? { imageUrl: product.imageUrl }
      : {}),
  }
}

export function formatPrice(priceAmount1000?: number | null, currency?: string | null) {
  if (priceAmount1000 === undefined || priceAmount1000 === null) return ''
  return `${currency ?? ''} ${(priceAmount1000 / 1000).toFixed(2)}`.trim()
}

export function ProductPicker({
  value,
  onChange,
}: {
  value: ProductPayload | null
  onChange: (next: ProductPayload | null) => void
}) {
  const devices = useIpcQuery('device:list')
  const [deviceId, setDeviceId] = useState(value?.deviceId ?? '')
  const catalog = useIpcQuery('catalog:list', { deviceId }, { enabled: deviceId !== '' })
  const products = deviceId !== '' ? (catalog.data ?? []) : []

  return (
    <div className="flex flex-col gap-3" data-testid="rich-product">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="product-device" className="text-xs font-semibold text-ink">
          Business device
        </label>
        <select
          id="product-device"
          data-testid="product-device"
          value={deviceId}
          onChange={(e) => {
            setDeviceId(e.target.value)
            onChange(null)
          }}
          className={INPUT_CLASS}
        >
          <option value="">-- Choose a device --</option>
          {(devices.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {deviceId !== '' && catalog.error && (
        <p className="text-xs text-danger" role="alert" data-testid="product-error">
          Could not load this device&apos;s catalog: {catalog.error.userMessage}
        </p>
      )}

      {deviceId !== '' && !catalog.error && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="product-select" className="text-xs font-semibold text-ink">
            Product
          </label>
          <select
            id="product-select"
            data-testid="product-select"
            value={value?.productId ?? ''}
            disabled={catalog.loading || products.length === 0}
            onChange={(e) => {
              const product = products.find((p) => p.id === e.target.value)
              onChange(product ? toSnapshot(deviceId, product) : null)
            }}
            className={INPUT_CLASS}
          >
            <option value="">
              {catalog.loading
                ? 'Loading catalog…'
                : products.length === 0
                  ? 'This catalog has no products'
                  : '-- Choose a product --'}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.priceAmount1000 !== null
                  ? ` — ${formatPrice(p.priceAmount1000, p.currency)}`
                  : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-subtle">
            Product cards need a WhatsApp Business account with a catalog. The
            template&apos;s message is sent as the card&apos;s text.
          </p>
        </div>
      )}
    </div>
  )
}

import { z } from "zod"
import { koda_API_BASE } from "./constants.js"
import { getDefaultHeaders, buildkodaHeaders } from "../headers.js"

/**
 * koda notification schema
 */
export const kodaNotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  action: z
    .object({
      actionText: z.string(),
      actionURL: z.string(),
    })
    .optional(),
  showIn: z.array(z.string()).optional(),
  suggestModelId: z.string().optional(),
})

export type kodaNotification = z.infer<typeof kodaNotificationSchema>

const NotificationsResponseSchema = z.object({
  notifications: z.array(kodaNotificationSchema),
})

const NOTIFICATIONS_TIMEOUT_MS = 5000

/**
 * Fetch notifications from koda API
 *
 * @param options - Configuration with token and optional organization ID
 * @returns Array of notifications from the koda API (clients filter by showIn)
 */
export async function fetchkodaNotifications(options: {
  kodaToken?: string
  kodaOrganizationId?: string
}): Promise<kodaNotification[]> {
  const token = options.kodaToken
  if (!token) return []

  const url = `${koda_API_BASE}/api/users/notifications`

  try {
    const response = await fetch(url, {
      headers: {
        ...getDefaultHeaders(),
        ...buildkodaHeaders(undefined, { kodaOrganizationId: options.kodaOrganizationId }),
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(NOTIFICATIONS_TIMEOUT_MS),
    })

    if (!response.ok) return []

    const json = await response.json()
    const result = NotificationsResponseSchema.safeParse(json)

    if (!result.success) return []

    return result.data.notifications
  } catch {
    return []
  }
}

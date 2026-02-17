export type NotificationType = 'UPDATE'

export interface NotificationRow<TNotificationData = unknown> {
  id: string
  user_id: string
  notification_type: NotificationType
  notification_data: TNotificationData
  created_at: string
}

export interface UpdateNotificationData {
  version_id: string
  title?: string
  message?: string
  release_url?: string
}

export interface UpdateNotificationRow extends NotificationRow<UpdateNotificationData> {
  notification_type: 'UPDATE'
}

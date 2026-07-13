import { DateTime } from 'luxon'

export interface Createverification_token_hashDTO {
  purpose?:
    | 'purpose'
    | 'account_activation'
    | 'account_activation_reply_token'
    | 'password_recovery'
  verified: boolean
  verification_token_hash: string
  verification_token_expires_at: DateTime
  verification_token_public: string
  empresa_id?: string
  user_id?: string
}
export interface Updateverification_token_hashDTO {
  purpose: 'purpose' | 'account_activation' | 'account_activation_reply_token' | 'password_recovery'
  verified?: boolean
  verification_token_hash?: string
  verification_token_expires_at?: DateTime
  verification_token_public?: string
  empresa_id?: string
  user_id?: string
}

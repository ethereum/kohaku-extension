import { Secret } from './commitment'

export interface MasterKeys {
  masterNullifier: Secret
  masterSecret: Secret
}

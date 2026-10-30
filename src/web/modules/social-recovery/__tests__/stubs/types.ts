import type { ReactNode } from 'react'

export interface ChildrenProps {
  children?: ReactNode
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

export type StringEntry = { keyPath: string; value: string }

export type RouteEntry = { route: string; title: string; name: string; withTitlePrefix?: boolean }

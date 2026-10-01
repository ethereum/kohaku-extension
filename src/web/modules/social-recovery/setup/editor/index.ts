/**
 * The editor's operations, its words and its types, loadable in a Node test.
 * The screen and the view import React Native and the extension's contexts,
 * so each is imported by its own path: `setup/editor/EditorScreen` for the
 * route and `setup/editor/EditorView` for the editor over given records.
 */
export * from './operations'
export {
  renderClientRefusal,
  renderFailedTestLine,
  renderFinding,
  renderHeldThreshold,
  renderKindHeader,
  renderKindName,
  renderRowChip
} from './copy'
export type {
  ClauseRole,
  ClientRefusal,
  EditorClient,
  EditorLoad,
  EditorViewProps,
  EditResult,
  HeldThresholds,
  PickerEntry,
  PickerTarget,
  SlotPosition
} from './types'

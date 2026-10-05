/**
 * The SDK interfaces the account recovery module builds against.
 *
 * Every declaration is imported from no SDK package, so the SDK doubles and the
 * real SDK meet on one shape. Types only, beside `as const` vocabularies for the
 * closed sets. The twelve interfaces' member lists are fixed. Record fields and
 * slugs follow the SDK's examples or are the extension's own, and can change
 * when the SDK ships.
 *
 * The twelve interfaces, by file:
 * - interactor.ts: ISetupClient, IRecoveryClient, IPolicyManagerInteractor,
 *   IMethodModuleReads, IRecoveryActionInteractor, IRecoveryActionArming
 * - events.ts: IEventManager
 * - formats.ts: IActionCodec, IMethodCodec
 * - methods.ts: IMethodsOrchestrator, IRecoveryMethod
 * - builder.ts: IProvider
 *
 * A change in this folder is a design change first.
 */
export * from './common'
export * from './interactor'
export * from './events'
export * from './formats'
export * from './utilities'
export * from './methods'
export * from './gathering'
export * from './builder'
export * from './privacy'

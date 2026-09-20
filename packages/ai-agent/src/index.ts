export { EventStore, createEventStore } from './event-store';
export { EmbeddingService, createEmbeddingService, OpenAIEmbeddingProvider, LocalEmbeddingProvider } from './embeddings';
export { EventStore as EventStoreClass } from '../event-store';
export { events, projections, embeddings } from '../event-store/schema';
export { AgentRuntime, createAgentRuntime, AgentRuntime as Agent } from './agent';
export { useBackgroundSync, useServiceWorkerSync } from './useBackgroundSync';
export { useSyncStatus, useSyncStatusCompact } from '../components/SyncStatusIndicator';
import type { AmazonMarketplaceId } from './lib/amazonMarketplaces'

// ===== 设置 =====

export type ApiMode = 'images' | 'responses' | 'chat'
export type ApiSetupMode = 'standard' | 'single-connection'
export type AppMode = 'gallery' | 'agent'
export type TaskWorkflow = 'instant-retail' | 'amazon-listing' | 'amazon-aplus' | 'seedream-edit' | 'gallery' | 'agent' | 'unknown'
export type TaskAspect = 'square' | 'landscape' | 'portrait'
export type HistoryWorkflowFilter = 'all' | TaskWorkflow
export type HistoryAspectFilter = 'all' | TaskAspect
export type ReferenceImageEditAction = 'ask' | 'replace-reference' | 'add-mask'
export type BuiltInApiProvider = 'openai' | 'fal' | 'volcengine'
export type ApiProvider = BuiltInApiProvider | string
export type CustomProviderTemplate = 'http-image'
export const DEFAULT_STREAM_PARTIAL_IMAGES = 1
export const DEFAULT_AGENT_MAX_TOOL_ROUNDS = 15

export type CustomProviderRequestMethod = 'GET' | 'POST'
export type CustomProviderContentType = 'json' | 'multipart'
export type CustomProviderFileSource = 'inputImages' | 'mask'

export interface CustomProviderFileMapping {
  field: string
  source: CustomProviderFileSource
  array?: boolean
}

export interface CustomProviderResultMapping {
  imageUrlPaths?: string[]
  b64JsonPaths?: string[]
}

export interface CustomProviderSubmitMapping {
  path: string
  method?: CustomProviderRequestMethod
  contentType?: CustomProviderContentType
  query?: Record<string, string>
  body?: Record<string, unknown>
  files?: CustomProviderFileMapping[]
  taskIdPath?: string
  result?: CustomProviderResultMapping
}

export interface CustomProviderPollMapping {
  path: string
  method?: CustomProviderRequestMethod
  query?: Record<string, string>
  intervalSeconds?: number
  statusPath: string
  successValues: string[]
  failureValues: string[]
  errorPath?: string
  result: CustomProviderResultMapping
}

export interface CustomProviderDefinition {
  id: string
  name: string
  template?: CustomProviderTemplate
  submit: CustomProviderSubmitMapping
  editSubmit?: CustomProviderSubmitMapping
  poll?: CustomProviderPollMapping
}

export interface ApiProfile {
  id: string
  name: string
  provider: ApiProvider
  baseUrl: string
  apiKey: string
  model: string
  timeout: number
  apiMode: ApiMode
  codexCli: boolean
  apiProxy: boolean
  responseFormatB64Json?: boolean
  streamImages?: boolean
  streamPartialImages?: number
  providerDrafts?: Partial<Record<ApiProvider, Partial<Pick<ApiProfile, 'baseUrl' | 'model' | 'apiMode' | 'codexCli' | 'apiProxy' | 'responseFormatB64Json' | 'streamImages' | 'streamPartialImages'>>>>
}

export interface AppSettings {
  /** 旧版单配置字段：保留用于导入/查询参数兼容，实际请求以 active profile 为准 */
  baseUrl: string
  apiKey: string
  model: string
  timeout: number
  apiMode: ApiMode
  codexCli: boolean
  apiProxy: boolean
  streamImages?: boolean
  streamPartialImages?: number
  customProviders: CustomProviderDefinition[]
  providerOrder?: string[]
  clearInputAfterSubmit: boolean
  persistInputOnRestart: boolean
  reuseTaskApiProfileTemporarily: boolean
  alwaysShowRetryButton: boolean
  enterSubmit: boolean
  referenceImageEditAction: ReferenceImageEditAction
  agentScrollToBottomAfterSubmit: boolean
  agentMaxToolRounds: number
  agentWebSearch: boolean
  profiles: ApiProfile[]
  activeProfileId: string
  /** Seedream Pro 图片编辑页专用配置；不会改变首页活动生图配置 */
  seedreamEditorProfileId: string
  amazonPlannerProfileId: string
  apiSetupMode: ApiSetupMode
  customStyleReferences: CustomStyleReference[]
}

// ===== 任务参数 =====

export interface TaskParams {
  size: string
  quality: 'auto' | 'low' | 'medium' | 'high'
  output_format: 'png' | 'jpeg' | 'webp'
  output_compression: number | null
  moderation: 'auto' | 'low'
  n: number
}

export const DEFAULT_OUTPUT_COMPRESSION = 70

export const DEFAULT_PARAMS: TaskParams = {
  size: 'auto',
  quality: 'auto',
  output_format: 'jpeg',
  output_compression: DEFAULT_OUTPUT_COMPRESSION,
  moderation: 'auto',
  n: 1,
}

// ===== 输入图片（UI 层面） =====

export interface InputImage {
  /** IndexedDB image store 的 id（SHA-256 hash） */
  id: string
  /** data URL，用于预览 */
  dataUrl: string
}

export interface MaskDraft {
  targetImageId: string
  maskDataUrl: string
  updatedAt: number
}

// ===== 即时零售 =====

export type RetailPlatformId = 'meituan' | 'taobao_flash' | 'jd'
export type RetailArchetypeId =
  | 'alcohol'
  | 'beverage'
  | 'fresh_food'
  | 'chilled_frozen'
  | 'packaged_food'
  | 'personal_beauty'
  | 'household_cleaning'
  | 'health_medical'
  | 'mother_baby'
  | 'pet'
  | 'electronics'
  | 'home_kitchen'
  | 'home_improvement'
  | 'apparel_textile'
  | 'stationery_toys'
  | 'books_media'
  | 'nutrition_supplements'
  | 'prepared_food'
  | 'floral_gardening'
  | 'adult_products'
  | 'jewelry_eyewear'
  | 'automotive_outdoor'
  | 'other'

export type RetailSlotId =
  | '01-main'
  | '02-front'
  | '03-selling-points'
  | '04-detail'
  | '05-scene'
  | '06-specification'
  | '07-detail-page'
  | '08-special'

export type RetailFactSource = 'user' | 'pool' | 'package' | 'ocr' | 'derived'
export type RetailComposeMode = 'none' | 'selling-points' | 'specification' | 'detail' | 'special'
export type RetailImageProcessingMode = 'ai' | RetailSpecialProcessingMode

export type RetailSpecialImageType =
  | 'product_facts'
  | 'dimension'
  | 'size_guide'
  | 'gift_pack'
  | 'back_label'
  | 'authentic_document'

export type RetailSourceImageRole =
  | 'product'
  | 'back_label'
  | 'gift_pack'
  | 'authentic_document'

export type RetailSpecialImageState =
  | 'ready'
  | 'needs-fields'
  | 'needs-upload'
  | 'not-applicable'

export type RetailSpecialProcessingMode = 'deterministic' | 'ai-preserve' | 'source-only'

export interface RetailSpecialImageOption {
  type: RetailSpecialImageType
  label: string
  state: RetailSpecialImageState
  eligible: boolean
  missingFields: string[]
  copyLines: string[]
  requiredSourceRole?: RetailSourceImageRole
  processingMode: RetailSpecialProcessingMode
  allowAiGeneration: boolean
  reason: string
}

export interface RetailSpecialImageEvaluation extends RetailSpecialImageOption {
  selectedType: RetailSpecialImageType
  eligibleTypes: RetailSpecialImageType[]
  options: RetailSpecialImageOption[]
}

/** 类目只提供受控名词与方向，句子骨架永远来自 RETAIL_SLOT_RECIPES */
export interface RetailSubjectRules {
  /** 04 细节图允许 crop-in 的表面白名单，必须全是无微缩文字的表面 */
  detail_targets?: string[]
  /** 印有品名与规格的那一面，02 与 06 用它决定把哪面转向镜头 */
  text_surfaces?: string[]
  /** 05 场景图的承托面与机位 */
  scene_surfaces?: string[]
  camera_angle_en?: string
  /** 只有一张正面参考图时的转角上限 */
  rotation_cap_en?: string
}

export interface RetailArchetype {
  id: RetailArchetypeId
  label: string
  match_keywords: string[]
  required_facts: string[]
  /**
   * @deprecated 7 元素裸数组，按 RETAIL_SLOT_IDS 下标直取会整体错位一格
   * （知识库那份序列里没有「核心卖点」这一位）。改用按 slotId 键控的 slot_directions。
   */
  slot_plan: string[]
  /** 按 slotId 键控的类目方向；zh 只进 UI，en 才进 prompt */
  slot_directions?: Partial<Record<RetailSlotId, { zh: string; en: string }>>
  subject_rules?: RetailSubjectRules
  /** 中文审核规则，只给人看，绝不进模型 */
  forbidden: string[]
  /** 英文负面镜像，只有这一份允许进模型 */
  forbidden_en?: string[]
}

export interface RetailCategoryKnowledge {
  path: string
  count: number
  archetype: RetailArchetypeId
  attribute_keys: string[]
  sale_units: string[]
  spec_types: string[]
  image_baseline: {
    main_p50: number
    detail_p50: number
  }
}

export interface RetailKnowledgeData {
  schema_version: number
  generated_at: string
  source_sha256: string
  rows_scanned: number
  archetypes: Record<RetailArchetypeId, Omit<RetailArchetype, 'id'>>
  top_level_archetypes: Record<RetailPlatformId, Record<string, RetailArchetypeId>>
  categories: Record<RetailPlatformId, RetailCategoryKnowledge[]>
}

export interface RetailProduct {
  name: string
  platform: RetailPlatformId
  categoryPath: string
  archetypeId: RetailArchetypeId
  brand: string
  sku: string
  barcode: string
  saleSpecification: string
  saleUnit: string
  netContent: string
  packageForm: string
  flavor: string
  storage: string
  shelfLife: string
  ingredients: string
  material: string
  packageIncludes: string
  usage: string
  audience: string
  description: string
  sellingPoints: string[]
  attributes: Record<string, string>
  factSources: Record<string, RetailFactSource>
  factVerification: Record<string, boolean>
  forbidden: string
  customPrompt: string
}

export interface RetailValidationIssue {
  code: string
  field: string
  label: string
  message: string
  severity: 'error' | 'warning'
}

export interface RetailPlatformPreset {
  id: string
  platform: RetailPlatformId
  label: string
  description: string
  source: 'official' | 'business-default'
  editable: boolean
  main: { width: number; height: number }
  gallery: { width: number; height: number }
  detail: { width: number; height: number }
  maxBytes: number | null
  outputFormat: 'png' | 'jpeg' | 'webp'
}

export interface RetailImagePlan {
  id: RetailSlotId
  order: number
  label: string
  objective: string
  prompt: string
  negativePrompt: string
  composeMode: RetailComposeMode
  copyLines: string[]
  targetSize: { width: number; height: number }
  generationSize: string
  generationEligible: boolean
  processingMode: RetailImageProcessingMode
  specialImageType?: RetailSpecialImageType
  requiredSourceRole?: RetailSourceImageRole
  blockedReason?: string
}

export type RetailSlotStatus = 'idle' | 'queued' | 'running' | 'done' | 'error'

export interface RetailProjectSlot {
  slotId: RetailSlotId
  status: RetailSlotStatus
  taskId: string | null
  outputImageId: string | null
  composedImageId: string | null
  error: string | null
  qualityStatus: 'unchecked' | 'pass' | 'warning' | 'blocked'
}

export type QnhExistingImageDecision = 'unreviewed' | 'keep' | 'remove'
export type QnhGateVerdict = 'unreviewed' | 'pass' | 'reject'
export type QnhInventoryImageKind = 'main' | 'detail' | 'special'
export type QnhOutputTarget = 'main' | 'detail' | 'special'
export type QnhPlanStatus = 'planned' | 'executing' | 'succeeded' | 'failed'

export interface QnhInventoryImage {
  id: string
  kind: QnhInventoryImageKind
  index: number
  url: string
  pictureType?: number
}

export interface QnhSpecialInventoryItem {
  pictureType: number
  label: string
  required: boolean
  images: QnhInventoryImage[]
}

export interface QnhInventorySnapshot {
  spuId: string
  productName: string
  mainImages: QnhInventoryImage[]
  detailImages: QnhInventoryImage[]
  specialImages: QnhSpecialInventoryItem[]
  customizedMain: boolean
  customizedDetail: boolean
  fingerprint: string
  fetchedAt: string
}

export interface QnhExistingImageReview {
  decision: QnhExistingImageDecision
  reason: string
}

export interface QnhAuthenticityChecklist {
  packagingText: boolean
  brand: boolean
  specification: boolean
  color: boolean
  unitCount: boolean
  structure: boolean
}

export interface QnhOutputReview {
  slotId: RetailSlotId
  target: QnhOutputTarget
  pictureType: number | null
  sourceImageId: string
  outputImageId: string
  sourceRole: RetailSourceImageRole
  processingMode: RetailImageProcessingMode
  verdict: QnhGateVerdict
  checklist: QnhAuthenticityChecklist
  note: string
}

export interface QnhBridgeHealth {
  version: string
  mode: 'fake' | 'real'
  storeName: string
  tenantId: string
  storeId: string
  busy: boolean
  activePlanId: string | null
}

export interface QnhPlanSummary {
  planId: string
  sha256: string
  confirmationPhrase: string
  addedMain: number
  addedDetail: number
  addedSpecial: number
  removed: number
  status: QnhPlanStatus
}

export interface QnhLedgerEntry {
  ts: string
  phase: string
  status: 'info' | 'pass' | 'fail'
  message: string
}

export interface QnhExecutionSummary {
  planId: string
  status: QnhPlanStatus
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  ledger: QnhLedgerEntry[]
}

export interface QnhRepairDraft {
  bridgeUrl: string
  spuId: string
  inventory: QnhInventorySnapshot | null
  existingDecisions: Record<string, QnhExistingImageReview>
  outputReviews: Partial<Record<RetailSlotId, QnhOutputReview>>
  detachAcknowledged: boolean
  planId: string | null
  planSummary: QnhPlanSummary | null
  execution: QnhExecutionSummary | null
}

export interface QnhRepairPlanRequest {
  schemaVersion: 1
  identity: Pick<QnhBridgeHealth, 'storeName' | 'tenantId' | 'storeId'>
  product: {
    spuId: string
    name: string
    barcode: string
    sku: string
  }
  inventory: {
    fingerprint: string
    fetchedAt: string
    mainImages: QnhInventoryImage[]
    detailImages: QnhInventoryImage[]
    specialImages: QnhSpecialInventoryItem[]
    decisions: Array<QnhInventoryImage & QnhExistingImageReview & { imageId: string }>
  }
  outputs: Array<QnhOutputReview & {
    verdict: 'pass'
    sourceDataUrl: string
    outputDataUrl: string
  }>
  detachAcknowledged: true
  createdAt: string
}

export interface RetailProject {
  id: string
  title: string
  product: RetailProduct
  sourceImageIds: string[]
  sourceImageRoles: Record<string, RetailSourceImageRole>
  specialImageType: RetailSpecialImageType | 'auto'
  platformPresetId: string
  styleId: string
  concurrency: number
  /** 批量上传包的起始编号：1 = 连主图整套替换，2 = 只补附图 */
  batchStartIndex: number
  queuePaused: boolean
  plans: RetailImagePlan[]
  slots: RetailProjectSlot[]
  qnhRepair: QnhRepairDraft
  createdAt: number
  updatedAt: number
}

export type SeedreamEditorResolution = '2k' | '4k'
export type ImageEditorEngine = 'home' | 'seedream'
export type SeedreamAnnotationKind = 'brush' | 'rectangle' | 'ellipse' | 'arrow'

export interface SeedreamAnnotationPoint {
  /** 相对原图宽高归一化后的坐标 */
  x: number
  y: number
}

export interface SeedreamAnnotation {
  id: string
  kind: SeedreamAnnotationKind
  color: string
  /** 相对原图短边归一化后的线宽 */
  width: number
  points: SeedreamAnnotationPoint[]
}

export interface SeedreamEditorDraft {
  engine: ImageEditorEngine
  sourceImageId: string | null
  referenceImageIds: string[]
  instruction: string
  annotations: SeedreamAnnotation[]
  resolution: SeedreamEditorResolution
  latestTaskId: string | null
  updatedAt: number
}

export interface TaskImageEditContext {
  /** 编辑器使用的配置角色；旧任务缺失时根据任务服务商推断 */
  engine?: ImageEditorEngine
  sourceImageId: string
  visualGuideImageId?: string | null
  referenceImageIds: string[]
  userInstruction: string
}

// ===== 任务记录 =====

export type TaskStatus = 'running' | 'done' | 'error'

export interface TaskRecord {
  id: string
  prompt: string
  params: TaskParams
  /** 生成时使用的 Provider 类型 */
  apiProvider?: ApiProvider
  /** 生成时使用的 API 配置 ID */
  apiProfileId?: string
  /** 生成时使用的 Provider 名称 */
  apiProfileName?: string
  /** 生成时使用的 API 模式 */
  apiMode?: ApiMode
  /** 生成时使用的模型 ID */
  apiModel?: string
  /** fal.ai 队列请求 ID，用于连接断开后的结果恢复 */
  falRequestId?: string
  /** fal.ai 队列 endpoint，用于连接断开后的状态和结果查询 */
  falEndpoint?: string
  /** fal.ai 任务连接断开后是否等待自动恢复 */
  falRecoverable?: boolean
  /** 自定义异步服务商任务 ID，用于重启后继续查询结果 */
  customTaskId?: string
  /** 自定义异步任务是否等待自动恢复 */
  customRecoverable?: boolean
  /** API 返回的实际生效参数，用于标记与请求值不一致的情况 */
  actualParams?: Partial<TaskParams>
  /** 输出图片对应的实际生效参数，key 为 outputImages 中的图片 id */
  actualParamsByImage?: Record<string, Partial<TaskParams>>
  /** 输出图片对应的 API 改写提示词，key 为 outputImages 中的图片 id */
  revisedPromptByImage?: Record<string, string>
  /** 输入图片的 image store id 列表 */
  inputImageIds: string[]
  maskTargetImageId?: string | null
  maskImageId?: string | null
  /** 输出图片的 image store id 列表 */
  outputImages: string[]
  /** 流式生成的中间步骤图片 id 列表，仅失败时保留供排查/下载 */
  streamPartialImageIds?: string[]
  /** API 返回的原始图片 HTTP URL（非 base64 时记录） */
  rawImageUrls?: string[]
  /** 发生解析错误时的原始响应 JSON */
  rawResponsePayload?: string
  status: TaskStatus
  error: string | null
  createdAt: number
  finishedAt: number | null
  /** 总耗时毫秒 */
  elapsed: number | null
  /** 是否收藏 */
  isFavorite?: boolean
  /** 来源模式：画廊 / Agent */
  sourceMode?: AppMode
  /** Agent 对话 ID */
  agentConversationId?: string
  /** Agent 轮次 ID */
  agentRoundId?: string
  /** Agent 消息 ID */
  agentMessageId?: string
  /** Agent 图像工具调用 ID */
  agentToolCallId?: string
  /** Agent 批量图像工具调用 ID */
  agentBatchCallId?: string
  /** Agent 图像工具实际动作 */
  agentToolAction?: 'generate' | 'edit' | 'auto' | string
  /** 图片编辑任务中的输入角色与原始用户要求 */
  imageEditContext?: TaskImageEditContext
  /** 历史筛选分类元数据；旧任务可为空并由前端推断 */
  category?: {
    productTitle?: string
    workflow?: TaskWorkflow
    amazonSlot?: string
    aPlusType?: 'standard' | 'standard-large' | 'premium' | 'mobile'
    marketplaceId?: AmazonMarketplaceId
    styleReferenceImageId?: string
    retailProjectId?: string
    retailSlot?: RetailSlotId
  }
}

export interface AmazonVisualSystem {
  styleName: string
  colorPalette: string
  lighting: string
  background: string
  typography: string
  composition: string
  overlayStyle: string
}

export interface AmazonPlannerSessionDraft {
  productTitle: string
  category: string
  brand: string
  color: string
  material: string
  audience: string
  sellingPoints: string
  packageIncludes: string
  scene: string
  forbidden: string
  kind?: string
}

export interface AmazonPlannerSessionStyleCandidate {
  label: string
  description: string
  prompt: string
  negativePrompt: string
}

export interface AmazonPlannerSessionImagePlan {
  slot: string
  label: string
  kind?: string
  planMarkdown: string
  prompt: string
  negativePrompt: string
}

export interface AmazonPlannerSessionAPlusPlan {
  slot: string
  label: string
  moduleType: string
  uploadSize: string
  generationSize: string
  planMarkdown: string
  textTitle: string
  textBody: string
  prompt: string
  negativePrompt: string
}

export interface AmazonPlannerSessionAPlusModuleSpec {
  contentType: 'standard' | 'standard-large' | 'premium' | 'mobile' | 'optional'
  slot: string
  label: string
  displayLabel: string
  moduleType: string
  uploadWidth: number
  uploadHeight: number
  objective: string
}

export interface AmazonPlannerSessionStyleImage {
  candidateIndex: number
  imageId: string
}

export type AmazonStyleDensityMode = 'rich' | 'minimal'

export interface StyleReferenceEditState {
  title: string
  palette: string[]
  typography: string
  lighting: string
  material: string
  density: AmazonStyleDensityMode
}

export interface CustomStyleReference {
  id: string
  basePresetId?: string | null
  title: string
  editState: StyleReferenceEditState
  imageId: string
  createdAt: number
  updatedAt: number
}

export interface AmazonPlannerSession {
  id: string
  title: string
  mode: 'listing' | 'aplus'
  marketplaceId?: AmazonMarketplaceId
  aPlusType: 'standard' | 'standard-large' | 'premium' | 'mobile'
  resolution: '2k' | '4k'
  listingImageCount?: number
  aPlusModuleSpecs?: Partial<Record<'standard' | 'standard-large' | 'premium' | 'mobile', AmazonPlannerSessionAPlusModuleSpec[]>>
  listingText: string
  referenceImageIds: string[]
  draft: AmazonPlannerSessionDraft
  seriesStyleGuides: {
    listing: string
    aplus: string
  }
  styleCandidates: AmazonPlannerSessionStyleCandidate[]
  styleImages: AmazonPlannerSessionStyleImage[]
  selectedStyleIndex: number | null
  selectedStylePresetId?: string | null
  selectedStyleReferenceImageId?: string | null
  selectedCustomStyleReferenceId?: string | null
  selectedCustomStyleReferenceSnapshot?: CustomStyleReference | null
  styleDensityMode?: AmazonStyleDensityMode
  imagePlans: AmazonPlannerSessionImagePlan[]
  aPlusPlans: AmazonPlannerSessionAPlusPlan[]
  selectedPlanIndex: number | null
  selectedAPlusPlanIndex: number | null
  createdAt: number
  updatedAt: number
}

// ===== Agent 模式 =====

export type AgentMessageRole = 'user' | 'assistant'
export type AgentRoundStatus = 'running' | 'done' | 'error'

export interface AgentMessage {
  id: string
  role: AgentMessageRole
  content: string
  roundId: string
  inputImageIds?: string[]
  maskTargetImageId?: string | null
  maskImageId?: string | null
  outputTaskIds?: string[]
  createdAt: number
}

export interface AgentRound {
  id: string
  index: number
  parentRoundId?: string | null
  userMessageId: string
  assistantMessageId?: string
  prompt: string
  inputImageIds: string[]
  maskTargetImageId?: string | null
  maskImageId?: string | null
  outputTaskIds: string[]
  responseId?: string
  responseOutput?: ResponsesOutputItem[]
  status: AgentRoundStatus
  error: string | null
  createdAt: number
  finishedAt: number | null
}

export interface AgentConversation {
  id: string
  title: string
  activeRoundId?: string | null
  createdAt: number
  updatedAt: number
  rounds: AgentRound[]
  messages: AgentMessage[]
}

// ===== IndexedDB 存储的图片 =====

export interface StoredImage {
  id: string
  dataUrl: string
  /** 图片首次存储时间（ms） */
  createdAt?: number
  /** 图片来源：用户上传 / API 生成 / 遮罩 / 风格参考 */
  source?: 'upload' | 'generated' | 'mask' | 'preset' | 'style-custom'
  /** 原图宽度 */
  width?: number
  /** 原图高度 */
  height?: number
}

export interface StoredImageThumbnail {
  id: string
  /** 列表缩略图，用于避免卡片页解码完整 4K 原图 */
  thumbnailDataUrl: string
  /** 原图宽度 */
  width?: number
  /** 原图高度 */
  height?: number
  /** 缩略图生成参数版本 */
  thumbnailVersion?: number
}

// ===== API 请求体 =====

export interface ImageGenerationRequest {
  model: string
  prompt: string
  size: string
  quality: string
  output_format: string
  moderation: string
  output_compression?: number
  n?: number
}

// ===== API 响应 =====

export interface ImageResponseItem {
  b64_json?: string
  url?: string
  revised_prompt?: string
  size?: string
  quality?: string
  output_format?: string
  output_compression?: number
  moderation?: string
}

export interface ImageApiResponse {
  data: ImageResponseItem[]
  size?: string
  quality?: string
  output_format?: string
  output_compression?: number
  moderation?: string
  n?: number
}

export interface ResponsesOutputItem {
  id?: string
  type?: string
  status?: string
  action?: string | Record<string, unknown>
  /** function_call: unique call id for sending back function_call_output */
  call_id?: string
  /** function_call: function name */
  name?: string
  /** function_call: JSON-encoded arguments string */
  arguments?: string
  /** function_call_output: JSON/text output string */
  output?: string
  annotations?: Array<{
    type?: string
    start_index?: number
    end_index?: number
    url?: string
    title?: string
  }>
  content?: Array<{
    type?: string
    text?: string
    annotations?: Array<{
      type?: string
      start_index?: number
      end_index?: number
      url?: string
      title?: string
    }>
  }>
  result?: string | {
    b64_json?: string
    image?: string
    data?: string
  }
  size?: string
  quality?: string
  output_format?: string
  output_compression?: number
  moderation?: string
  revised_prompt?: string
}

export interface ResponsesApiResponse {
  id?: string
  output?: ResponsesOutputItem[]
  tools?: Array<{
    type?: string
    size?: string
    quality?: string
    output_format?: string
    output_compression?: number
    moderation?: string
    n?: number
  }>
}

export interface FalImageFile {
  url?: string
  content_type?: string
  file_name?: string
  width?: number
  height?: number
  b64_json?: string
  base64?: string
  data?: string
}

export interface FalApiResponse {
  images?: FalImageFile[]
  image?: FalImageFile | string
  url?: string
  seed?: number
}

// ===== 导出数据 =====

/** ZIP manifest.json 格式 */
export interface ExportData {
  version: number
  exportedAt: string
  settings?: AppSettings
  tasks?: TaskRecord[]
  agentConversations?: AgentConversation[]
  amazonPlannerSessions?: AmazonPlannerSession[]
  retailProjects?: RetailProject[]
  /** imageId → 图片信息 */
  imageFiles?: Record<string, {
    path: string
    createdAt?: number
    source?: 'upload' | 'generated' | 'mask' | 'preset' | 'style-custom'
    width?: number
    height?: number
  }>
  /** imageId → 缩略图信息 */
  thumbnailFiles?: Record<string, {
    path: string
    width?: number
    height?: number
    thumbnailVersion?: number
  }>
}

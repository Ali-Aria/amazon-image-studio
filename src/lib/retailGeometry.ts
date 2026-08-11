/**
 * 合成层几何常量的单一真源。放在独立模块里、不引任何东西，
 * 让 retailComposer（绘制）、retailPlatform（推生成尺寸）、retailSafeBox（算安全区）
 * 三方共用同一份数字而不形成循环依赖。
 */
export const RETAIL_PANEL_PAD_PCT = 0.055
export const RETAIL_PANEL_WIDTH_PCT = 0.48
export const RETAIL_DETAIL_BAND_PCT = 0.43
export const RETAIL_SPECIAL_IMAGE_X_PCT = 0.54
export const RETAIL_SPECIAL_IMAGE_PAD_PCT = 0.05
export const RETAIL_SPECIAL_PANEL_WIDTH_PCT = 0.49

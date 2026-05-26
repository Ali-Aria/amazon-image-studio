const LISTING_KNOWLEDGE_RULES = [
  'Plan exactly 7 gallery images: MAIN + PT01-PT06. MAIN is the required primary image; PT01-PT06 should answer different buyer questions such as lifestyle use, detail/material proof, scale, package contents, setup/use steps, or other evidence from the listing.',
  'MAIN technical compliance: use a seamless pure white background RGB 255,255,255; product fills about 85% of the frame; show the complete product once, uncropped, with truthful color, proportion, quantity, and included accessories.',
  'MAIN visual exclusions: no text, logos, watermark, border, color blocks, badges, props, support stands, confusing accessories, or packaging unless the packaging itself is a real product feature.',
  'All gallery images must accurately represent the product title and only show what is sold. Avoid nudity or sexually suggestive content, buyer reviews, five-star ratings, pricing, coupons, free shipping claims, seller-specific claims, and unsupported claims.',
  'Do not include Amazon, Prime, Alexa, Amazon Choice, Best Seller, hot-sale badges, marketplace marks, or any lookalike logo or badge.',
  'Secondary images should not repeat the same angle. Use short mobile-readable US-English on-image copy only when it helps the buyer and remains compliant.',
]

const APLUS_KNOWLEDGE_RULES = [
  'Technical baseline: plan RGB JPG/PNG/BMP-style assets, sharp and non-blurry, with final export target under 2 MB and at least 72 dpi. Avoid watermarks and tiny text that is unreadable on mobile.',
  'Standard module upload sizes: Header Banner 970x300, Single Image 970x600, Highlight Tile 220x220. Optional reference sizes: Logo Image 600x180, Comparison Thumbnail 150x300.',
  'Large-image template sizes: one Header Banner 970x300 followed by four Single Image modules at 970x600.',
  'Premium module upload sizes: Hero Banner 1464x600, Feature Image 970x600, Brand Story 463x625. Optional Logo Image remains 600x180.',
  'Design direction: keep key content in the center safe area, use sparse mobile-readable copy, leave breathing room, and keep lighting, color palette, composition, and typography direction consistent across modules.',
  'A+ images must be unique to the product and brand story. Avoid simply reusing the same gallery images already planned for the listing image carousel.',
  'A+ compliance exclusions: no prices, discounts, coupons, free shipping, QR codes, phone numbers, email addresses, postal addresses, external URLs, hyperlinks, customer reviews, star ratings, competitor mentions, seller authorization claims, unsupported guarantees, or Amazon/Prime/Alexa/Amazon Choice/Best Seller badges.',
  'Claims and copy must be defensible. Avoid unsupported awards, certifications, eco claims, medical claims, cure/prevention claims, time-sensitive hype such as newest/best/sale, and aggressive purchase calls to action.',
]

function formatKnowledgeRules(title: string, rules: readonly string[]) {
  return [
    title,
    ...rules.map((rule) => `- ${rule}`),
  ].join('\n')
}

export function formatAmazonListingKnowledgeRules() {
  return formatKnowledgeRules('Embedded Amazon Listing knowledge rules:', LISTING_KNOWLEDGE_RULES)
}

export function formatAmazonAPlusKnowledgeRules() {
  return formatKnowledgeRules('Embedded Amazon A+ knowledge rules:', APLUS_KNOWLEDGE_RULES)
}

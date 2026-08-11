import type {
  InputImage,
  RetailImagePlan,
  RetailProjectSlot,
  RetailSlotId,
  RetailSourceImageRole,
} from '../types'

export function selectRetailPlanInputs(
  plan: RetailImagePlan,
  images: InputImage[],
  roles: Record<string, RetailSourceImageRole>,
) {
  if (plan.id !== '08-special') {
    const productImages = images.filter((image) => !roles[image.id] || roles[image.id] === 'product')
    return { images: productImages, useModel: true }
  }

  const byRole = (role: RetailSourceImageRole) => images.filter((image) => roles[image.id] === role)
  const productImages = byRole('product')

  if (plan.processingMode === 'ai-preserve') {
    const required = plan.requiredSourceRole ? byRole(plan.requiredSourceRole) : []
    return {
      images: [...productImages.slice(0, 1), ...required.slice(0, 1)].filter(
        (image, index, selected) => selected.findIndex((candidate) => candidate.id === image.id) === index,
      ),
      useModel: true,
    }
  }

  const required = plan.requiredSourceRole ? byRole(plan.requiredSourceRole) : productImages
  return { images: required.slice(0, 1), useModel: false }
}

export function getRetailGenerationTargets(plans: RetailImagePlan[], slots: RetailProjectSlot[]): RetailSlotId[] {
  const slotById = new Map(slots.map((slot) => [slot.slotId, slot]))
  const eligible = plans.filter((plan) => plan.generationEligible)
  const pending = eligible.filter((plan) => slotById.get(plan.id)?.status !== 'done')
  return (pending.length > 0 ? pending : eligible).map((plan) => plan.id)
}

import { rest } from 'msw'
import { createUpdatePetWithFormMutationResponse } from '../../mocks/petController/createUpdatePetWithForm'

export const updatePetWithFormHandler = rest.get('*/pet/:petId', function handler(req, res, ctx) {
  return res(ctx.json(createUpdatePetWithFormMutationResponse()))
})

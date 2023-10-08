import client from '../../../client'
import type { ResponseConfig } from '../../../client'
import type {
  UploadFileMutationRequest,
  UploadFileMutationResponse,
  UploadFilePathParams,
  UploadFileQueryParams,
} from '../../../models/ts/petController/UploadFile'

/**
 * @summary uploads an image
 * @link /pet/:petId/uploadImage
 */
export async function uploadFile<TData = UploadFileMutationResponse, TVariables = UploadFileMutationRequest>(
  petId: UploadFilePathParams['petId'],
  data?: TVariables,
  params?: UploadFileQueryParams,
  options: Partial<Parameters<typeof client>[0]> = {},
): Promise<ResponseConfig<TData>> {
  return client<TData, TVariables>({
    method: 'post',
    url: `/pet/${petId}/uploadImage`,
    params,
    data,
    ...options,
  })
}

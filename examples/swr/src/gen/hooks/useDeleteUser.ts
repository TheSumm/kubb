import useSWRMutation from 'swr/mutation'
import type { SWRMutationConfiguration, SWRMutationResponse } from 'swr/mutation'
import client from '@kubb/swagger-client/client'
import type { DeleteUserMutationResponse, DeleteUserPathParams, DeleteUser400 } from '../models/DeleteUser'

/**
 * @description This can only be done by the logged in user.
 * @summary Delete user
 * @link /user/:username
 */

export function useDeleteUser<TData = DeleteUserMutationResponse, TError = DeleteUser400>(
  username: DeleteUserPathParams['username'],
  options?: {
    mutation?: SWRMutationConfiguration<TData, TError, string>
    client?: Partial<Parameters<typeof client<TData, TError>>[0]>
  },
): SWRMutationResponse<TData, TError, string> {
  const { mutation: mutationOptions, client: clientOptions = {} } = options ?? {}

  return useSWRMutation<TData, TError, string>(
    `/user/${username}`,
    (url) => {
      return client<TData, TError>({
        method: 'delete',
        url,

        ...clientOptions,
      })
    },
    mutationOptions,
  )
}

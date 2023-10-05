import resolveQueryPath from '@/utils/queryPathResolver'
import { getDenyList } from '@/utils/prefix'
import isEqual from 'lodash/isEqual'
import { useSearchParams } from './utils/useSearchParams'
import { Ref } from 'vue'

import type { NFTWithMetadata, Stack } from '@/composables/useNft'

export type NFTStack = NFTWithMetadata & Stack

export type ItemsGridEntity = NFTWithMetadata | NFTStack
import { NFT } from '@/components/rmrk/service/scheme'
import { nftToListingCartItem } from '@/components/common/shoppingCart/utils'

import { isOwner as checkOwner } from '@/utils/account'
import { useListingCartStore } from '@/stores/listingCart'

export function useFetchSearch({
  first,
  total,
  isFetchingData,
  resetSearch,
  isLoading,
}: {
  first: Ref<number>
  total: Ref<number>
  isFetchingData: Ref<boolean>
  isLoading: Ref<boolean>
  resetSearch: () => void
}) {
  const { client, urlPrefix } = usePrefix()

  const route = useRoute()

  const nfts = ref<NFTWithMetadata[]>([])
  const loadedPages = ref([] as number[])

  const { searchParams } = useSearchParams()

  interface FetchSearchParams {
    page?: number
    loadDirection?: 'up' | 'down'
    search?: { [key: string]: string | number }[]
  }

  async function fetchSearch({
    page = 1,
    loadDirection = 'down',
    search,
  }: FetchSearchParams) {
    if (isFetchingData.value) {
      return false
    }
    isFetchingData.value = true

    const getQueryPath = (prefix: string) => {
      switch (prefix) {
        case 'rmrk':
          return 'chain-rmrk'
        case 'ksm':
          return 'chain-ksm'

        default:
          return prefix
      }
    }

    const variables = search?.length
      ? { search }
      : {
          search: searchParams.value,
          priceMin: Number(route.query.min),
          priceMax: Number(route.query.max),
        }

    const queryPath = getQueryPath(client.value)

    const query = await resolveQueryPath(queryPath, 'nftListWithSearch')
    const { data: result } = await useAsyncQuery({
      query: query.default,
      variables: {
        ...variables,
        first: first.value,
        offset: (page - 1) * first.value,
        denyList: getDenyList(urlPrefix.value),
        orderBy: route.query.sort?.length
          ? route.query.sort
          : ['blockNumber_DESC'],
      },
      clientId: client.value,
    })

    // handle results
    const { nFTEntities, nftEntitiesConnection } = result.data

    total.value = nftEntitiesConnection.totalCount

    if (!loadedPages.value.includes(page)) {
      if (loadDirection === 'up') {
        nfts.value = nFTEntities.concat(nfts.value)
      } else {
        nfts.value = nfts.value.concat(nFTEntities)
      }
      loadedPages.value.push(page)
    }

    isFetchingData.value = false
    isLoading.value = false
    return true
  }

  function clearFetchResults() {
    nfts.value = []
    loadedPages.value = []
  }

  const refetch = (search?: { [key: string]: string | number }[]) => {
    clearFetchResults()
    fetchSearch({ search })
  }

  watch(
    [
      () => route.query.sort,
      () => route.query.search,
      () => route.query.listed,
      () => route.query.min,
      () => route.query.max,
      () => route.query.owned,
      () => route.query.collections,
    ],
    (currentQuery, prevQuery) => {
      if (isEqual(currentQuery, prevQuery)) {
        return
      }
      loadedPages.value = []
      resetSearch()
    },
  )

  return {
    nfts,
    fetchSearch,
    refetch,
    clearFetchResults,
  }
}

export const updatePotentialNftsForListingCart = async (nfts: NFT[]) => {
  const listingCartStore = useListingCartStore()
  const { accountId } = useAuth()
  const potentialNfts = nfts
    .filter(
      (nft) =>
        !Number(nft.price) && checkOwner(nft.currentOwner, accountId.value),
    )
    .map((nft) => {
      const floorPrice = nft.collection.floorPrice[0]?.price || '0'
      return nftToListingCartItem(nft, floorPrice)
    })

  listingCartStore.setUnlistedItems(potentialNfts)
}

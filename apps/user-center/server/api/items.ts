import { defineEventHandler, getQuery } from 'h3'
import { getAllItems, searchItems } from '../utils/itemConfig'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = query.search as string

  console.log('[/api/items] 请求参数:', query)

  // 如果有搜索关键词，返回搜索结果
  if (search && search.trim()) {
    const results = searchItems(search.trim())
    console.log('[/api/items] 搜索结果:', results.length, '个物品')
    return {
      success: true,
      data: results
    }
  }

  // 否则返回所有物品
  const allItems = getAllItems()
  console.log('[/api/items] 返回所有物品:', allItems.length, '个')
  console.log('[/api/items] 前3个物品:', allItems.slice(0, 3))
  
  return {
    success: true,
    data: allItems
  }
})
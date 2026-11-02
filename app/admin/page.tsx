'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Order = {
  id: string
  order_number: number
  items: { menuId: string; name: string; price: number; selectedOptions: { [key: string]: string } }[]
  payment_type: string
  status: 'pending' | 'ready' | 'completed'
  created_at: string
}

type Menu = {
  id: string
  name: string
  price: number
  stock_status: 'abundance' | 'low' | 'sold_out'
  manual_cash_count: number
}

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([]) // 売上計算用（全完了注文を含む）
  const [menus, setMenus] = useState<Menu[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    // 未完了の注文（調理中・準備完了）
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('*')
      .neq('status', 'completed')
      .order('created_at', { ascending: true })

    // 全ての注文（売上集計用）
    const { data: historyOrders } = await supabase
      .from('orders')
      .select('*')

    // メニュー一覧（作成順で固定）
    const { data: menuData } = await supabase
      .from('menus')
      .select('id, name, price, stock_status, manual_cash_count')
      .order('created_at', { ascending: true })

    if (activeOrders) setOrders(activeOrders)
    if (historyOrders) setAllOrders(historyOrders)
    if (menuData) setMenus(menuData)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()

    const orderChannel = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchData()
      })
      .subscribe()

    const menuChannel = supabase
      .channel('public:menus')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menus' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(orderChannel)
      supabase.removeChannel(menuChannel)
    }
  }, [])

  const updateOrderStatus = async (id: string, newStatus: 'pending' | 'ready' | 'completed') => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) alert('更新に失敗しました: ' + error.message)
  }

  const updateStockStatus = async (id: string, currentStatus: string) => {
    const nextStatus = 
      currentStatus === 'abundance' ? 'low' :
      currentStatus === 'low' ? 'sold_out' : 'abundance'

    const { error } = await supabase
      .from('menus')
      .update({ stock_status: nextStatus })
      .eq('id', id)

    if (error) alert('在庫更新に失敗しました: ' + error.message)
  }

  // 手動現金販売数を増やす（または減らす）
  const addManualCashCount = async (menuId: string, currentCount: number) => {
    const { error } = await supabase
      .from('menus')
      .update({ manual_cash_count: currentCount + 1 })
      .eq('id', menuId)

    if (error) alert('更新に失敗しました: ' + error.message)
  }

  const subManualCashCount = async (menuId: string, currentCount: number) => {
    if (currentCount <= 0) return
    const { error } = await supabase
      .from('menus')
      .update({ manual_cash_count: currentCount - 1 })
      .eq('id', menuId)

    if (error) alert('更新に失敗しました: ' + error.message)
  }

  // 各商品の提供数と売上を計算する関数
  const getStats = (menuId: string, menuPrice: number, manualCount: number) => {
    let onlineCount = 0
    // モバイルオーダー（完了したもの）からカウントを集計
    allOrders
      .filter((o) => o.status === 'completed')
      .forEach((o) => {
        o.items.forEach((item) => {
          if (item.menuId === menuId) {
            onlineCount += 1
          }
        })
      })

    const totalCount = onlineCount + manualCount
    const onlineRevenue = onlineCount * menuPrice
    const cashRevenue = manualCount * menuPrice
    const totalRevenue = onlineRevenue + cashRevenue

    return { onlineCount, manualCount, totalCount, onlineRevenue, cashRevenue, totalRevenue }
  }

  if (loading) return <div className="p-6 text-center">読み込み中...</div>

  return (
    <main className="max-w-2xl mx-auto p-4 bg-gray-50 min-h-screen pb-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">店員用管理ダッシュボード</h1>
        <p className="text-sm text-gray-500">注文確認、在庫管理、売上・提供数集計を行います</p>
      </header>

      {/* 在庫・売上・手動現金追加セクション（順序固定） */}
      <section className="bg-white p-4 rounded-xl shadow-sm mb-6 border border-gray-100">
        <h2 className="text-lg font-bold mb-3 text-gray-700">📦 在庫管理 ＆ 売上・提供数</h2>
        <div className="space-y-4">
          {menus.map((menu) => {
            const stats = getStats(menu.id, menu.price, menu.manual_cash_count)
            return (
              <div key={menu.id} className="border p-4 rounded-xl bg-gray-50 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-bold text-gray-800 text-base">{menu.name}</span>
                    <span className="text-xs text-gray-500 ml-2">（¥{menu.price}）</span>
                  </div>
                  <button
                    onClick={() => updateStockStatus(menu.id, menu.stock_status)}
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      menu.stock_status === 'abundance' ? 'bg-green-100 text-green-800' :
                      menu.stock_status === 'low' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {menu.stock_status === 'abundance' ? '余裕あり' :
                     menu.stock_status === 'low' ? '残りわずか' : '在庫なし'}
                  </button>
                </div>

                {/* 提供数・売上の表示 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-white p-3 rounded-lg border">
                  <div>
                    <p className="text-gray-400">総提供数</p>
                    <p className="font-bold text-base text-gray-800">{stats.totalCount}個</p>
                  </div>
                  <div>
                    <p className="text-gray-400">モバイル注文</p>
                    <p className="font-semibold text-blue-600">{stats.onlineCount}個 (¥{stats.onlineRevenue})</p>
                  </div>
                  <div>
                    <p className="text-gray-400">現場現金販売</p>
                    <p className="font-semibold text-green-600">{stats.manualCount}個 (¥{stats.cashRevenue})</p>
                  </div>
                  <div>
                    <p className="text-gray-400">総売上金額</p>
                    <p className="font-bold text-base text-orange-600">¥{stats.totalRevenue}</p>
                  </div>
                </div>

                {/* 手動現金販売カウント用ボタン */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-gray-600 font-medium">現場現金の手動追加（直接販売分）:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => subManualCashCount(menu.id, menu.manual_cash_count)}
                      className="bg-gray-200 px-3 py-1 rounded font-bold hover:bg-gray-300"
                    >
                      -1
                    </button>
                    <span className="font-bold text-sm w-6 text-center">{menu.manual_cash_count}</span>
                    <button
                      onClick={() => addManualCashCount(menu.id, menu.manual_cash_count)}
                      className="bg-green-600 text-white px-3 py-1 rounded font-bold hover:bg-green-700"
                    >
                      +1個 (現金)
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 注文確認セクション */}
      <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold mb-3 text-gray-700">🛒 受付・調理中の注文一覧</h2>
        {orders.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">現在、未完了の注文はありません</p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl font-black text-orange-600">#{order.order_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      order.status === 'pending' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {order.status === 'pending' ? '調理中' : 'お渡し準備完了'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    {order.items.map((item, idx) => (
                      <div key={idx}>
                        • <span className="font-semibold">{item.name}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {Object.entries(item.selectedOptions || {}).map(([k, v]) => `${k}: ${v}`).join(' / ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {order.status === 'pending' ? (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'ready')}
                      className="flex-1 sm:flex-none bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600"
                    >
                      用意できた (通知)
                    </button>
                  ) : (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'completed')}
                      className="flex-1 sm:flex-none bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700"
                    >
                      提供終了（完了）
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
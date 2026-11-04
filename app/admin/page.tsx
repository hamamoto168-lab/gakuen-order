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
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('*')
      .neq('status', 'completed')
      .order('created_at', { ascending: true })

    const { data: historyOrders } = await supabase
      .from('orders')
      .select('*')

    // メニュー一覧を取得
    const { data: menuData } = await supabase
      .from('menus')
      .select('id, name, price, stock_status, manual_cash_count')

    if (activeOrders) setOrders(activeOrders)
    if (historyOrders) setAllOrders(historyOrders)
    
    // 【重要】メニューの並び順を「名前の文字コード順」で常に完全固定する
    if (menuData) {
      const sortedMenus = [...menuData].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      setMenus(sortedMenus)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()

    // 注文のみリアルタイム監視（メニューは再取得による位置ズレを防ぐため監視から外すか、ソートで固定）
    const orderChannel = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(orderChannel)
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

  // 現金追加：ローカルの数値を即座に＋1して、順序を崩さずにサーバーを更新する
  const addManualCashCount = async (menuId: string, currentCount: number) => {
    setMenus(menus.map(m => m.id === menuId ? { ...m, manual_cash_count: currentCount + 1 } : m))

    const { error } = await supabase
      .from('menus')
      .update({ manual_cash_count: currentCount + 1 })
      .eq('id', menuId)

    if (error) {
      alert('更新に失敗しました: ' + error.message)
      fetchData() // 失敗時は再取得
    }
  }

  const subManualCashCount = async (menuId: string, currentCount: number) => {
    if (currentCount <= 0) return
    setMenus(menus.map(m => m.id === menuId ? { ...m, manual_cash_count: currentCount - 1 } : m))

    const { error } = await supabase
      .from('menus')
      .update({ manual_cash_count: currentCount - 1 })
      .eq('id', menuId)

    if (error) {
      alert('更新に失敗しました: ' + error.message)
      fetchData()
    }
  }

  const getStats = (menuId: string, menuPrice: number, manualCount: number) => {
    let onlineCount = 0
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

  if (loading) return <div className="p-6 text-center text-black font-bold">読み込み中...</div>

  return (
    <main className="max-w-2xl mx-auto p-4 bg-gray-50 min-h-screen pb-12">
      <header className="mb-6">
        <h1 className="text-2xl font-black text-black">店員用管理ダッシュボード</h1>
        <p className="text-sm text-black font-bold mt-1">注文確認、在庫管理、売上・提供数集計を行います</p>
      </header>

      {/* 在庫・売上・手動現金追加セクション */}
      <section className="bg-white p-4 rounded-xl shadow-sm mb-6 border border-gray-200">
        <h2 className="text-lg font-black text-black mb-3">📦 在庫管理 ＆ 売上・提供数</h2>
        <div className="space-y-4">
          {menus.map((menu) => {
            const stats = getStats(menu.id, menu.price, menu.manual_cash_count)
            return (
              <div key={menu.id} className="border border-gray-300 p-4 rounded-xl bg-white flex flex-col gap-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-black text-black text-lg">{menu.name}</span>
                    <span className="text-sm text-black font-extrabold ml-2">（¥{menu.price}）</span>
                  </div>
                  <button
                    onClick={() => updateStockStatus(menu.id, menu.stock_status)}
                    className={`px-3 py-1.5 rounded-full text-xs font-black ${
                      menu.stock_status === 'abundance' ? 'bg-green-100 text-green-900 border border-green-300' :
                      menu.stock_status === 'low' ? 'bg-yellow-100 text-yellow-900 border border-yellow-300' : 'bg-red-100 text-red-900 border border-red-300'
                    }`}
                  >
                    {menu.stock_status === 'abundance' ? '余裕あり' :
                     menu.stock_status === 'low' ? '残りわずか' : '在庫なし'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div>
                    <p className="text-black font-bold">総提供数</p>
                    <p className="font-black text-base text-black">{stats.totalCount}個</p>
                  </div>
                  <div>
                    <p className="text-black font-bold">モバイル注文</p>
                    <p className="font-extrabold text-blue-800 text-sm">{stats.onlineCount}個 (¥{stats.onlineRevenue})</p>
                  </div>
                  <div>
                    <p className="text-black font-bold">現場現金販売</p>
                    <p className="font-extrabold text-green-800 text-sm">{stats.manualCount}個 (¥{stats.cashRevenue})</p>
                  </div>
                  <div>
                    <p className="text-black font-bold">総売上金額</p>
                    <p className="font-black text-base text-orange-600">¥{stats.totalRevenue}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-black font-extrabold">現場現金の手動追加（直接販売分）:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => subManualCashCount(menu.id, menu.manual_cash_count)}
                      className="bg-gray-200 px-3.5 py-1.5 rounded font-black hover:bg-gray-300 text-black border border-gray-400"
                    >
                      -1
                    </button>
                    <span className="font-black text-base w-8 text-center text-black">{menu.manual_cash_count}</span>
                    <button
                      onClick={() => addManualCashCount(menu.id, menu.manual_cash_count)}
                      className="bg-green-600 text-white px-3.5 py-1.5 rounded font-black hover:bg-green-700 shadow-sm"
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
      <section className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-lg font-black text-black mb-3">🛒 受付・調理中の注文一覧</h2>
        {orders.length === 0 ? (
          <p className="text-black font-bold text-sm text-center py-8">現在、未完了の注文はありません</p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="border border-gray-300 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white shadow-sm">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl font-black text-orange-600">#{order.order_number}</span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
                      order.status === 'pending' ? 'bg-blue-100 text-blue-900 border border-blue-300' : 'bg-purple-100 text-purple-900 border border-purple-300'
                    }`}>
                      {order.status === 'pending' ? '調理中' : 'お渡し準備完了'}
                    </span>
                  </div>
                  <div className="text-sm text-black space-y-1 font-bold">
                    {order.items.map((item, idx) => (
                      <div key={idx}>
                        • <span className="font-black text-black text-base">{item.name}</span>
                        <span className="text-xs text-black font-bold ml-2">
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
                      className="flex-1 sm:flex-none bg-orange-500 text-white px-4 py-2.5 rounded-lg text-sm font-black hover:bg-orange-600 shadow-sm"
                    >
                      用意できた (通知)
                    </button>
                  ) : (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'completed')}
                      className="flex-1 sm:flex-none bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-black hover:bg-green-700 shadow-sm"
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
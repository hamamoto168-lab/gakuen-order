'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Menu = {
  id: string
  name: string
  price: number
  image_url: string | null
  options: { name: string; type: 'single' | 'multiple'; choices: string[] }[]
  stock_status: 'abundance' | 'low' | 'sold_out'
}

type CartItem = {
  menuId: string
  name: string
  price: number
  selectedOptions: { [key: string]: string | string[] }
  quantity: number
}

export default function UserOrderPage() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [loading, setLoading] = useState(true)
  
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<{ [key: string]: string | string[] }>({})
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false)
  
  const [myOrderId, setMyOrderId] = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  const [orderStatus, setOrderStatus] = useState<string | null>(null)

  useEffect(() => {
    async function fetchMenus() {
      const { data } = await supabase.from('menus').select('*').order('created_at', { ascending: true })
      setMenus(data || [])
      setLoading(false)
    }
    fetchMenus()
  }, [])

  useEffect(() => {
    if (!myOrderId) return

    const channel = supabase
      .channel(`order-${myOrderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${myOrderId}` },
        (payload) => {
          setOrderStatus(payload.new.status)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [myOrderId])

  const handleOpenModal = (menu: Menu) => {
    setSelectedMenu(menu)
    const initialOptions: { [key: string]: string | string[] } = {}
    menu.options?.forEach((opt) => {
      if (opt.type === 'multiple') {
        initialOptions[opt.name] = []
      } else if (opt.choices.length > 0) {
        initialOptions[opt.name] = opt.choices[0]
      }
    })
    setSelectedOptions(initialOptions)
  }

  const handleCheckboxChange = (optName: string, choice: string, checked: boolean) => {
    const currentList = (selectedOptions[optName] as string[]) || []
    if (checked) {
      setSelectedOptions({ ...selectedOptions, [optName]: [...currentList, choice] })
    } else {
      setSelectedOptions({ ...selectedOptions, [optName]: currentList.filter((item) => item !== choice) })
    }
  }

  const handleAddToCart = () => {
    if (!selectedMenu) return
    const newItem: CartItem = {
      menuId: selectedMenu.id,
      name: selectedMenu.name,
      price: selectedMenu.price,
      selectedOptions: { ...selectedOptions },
      quantity: 1,
    }
    setCart([...cart, newItem])
    setSelectedMenu(null)
    setIsCartOpen(true)
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return

    const { data, error } = await supabase
      .from('orders')
      .insert([
        {
          items: cart,
          payment_type: 'cash',
          status: 'pending',
        },
      ])
      .select()

    if (error) {
      alert('注文の送信に失敗しました: ' + error.message)
    } else if (data && data.length > 0) {
      setMyOrderId(data[0].id)
      setOrderNumber(data[0].order_number)
      setOrderStatus('pending')
      setCart([])
      setIsCartOpen(false)
    }
  }

  if (loading) return <div className="p-6 text-center">読み込み中...</div>

  if (orderNumber) {
    return (
      <main className="max-w-md mx-auto p-6 bg-white min-h-screen text-center flex flex-col justify-center items-center">
        <h1 className="text-xl font-bold text-gray-800 mb-2">ご注文ありがとうございます！</h1>
        <div className="border-4 border-orange-500 rounded-2xl p-8 my-6 w-full shadow-lg bg-orange-50">
          <p className="text-sm text-gray-700 font-semibold mb-1">あなたの呼び出し番号</p>
          <p className="text-6xl font-black text-orange-600">#{orderNumber}</p>
        </div>
        
        <div className="mb-6">
          {orderStatus === 'pending' && (
            <div className="bg-blue-100 text-blue-900 px-4 py-2 rounded-xl font-bold">
              調理中です。しばらくお待ちください...
            </div>
          )}
          {orderStatus === 'ready' && (
            <div className="bg-orange-500 text-white px-6 py-4 rounded-xl font-black text-lg animate-bounce">
              お待たせしました！売り場まで取りにお越しください！
            </div>
          )}
          {orderStatus === 'completed' && (
            <div className="bg-green-100 text-green-900 px-4 py-2 rounded-xl font-bold">
              ご利用ありがとうございました！
            </div>
          )}
        </div>

        {orderStatus === 'completed' && (
          <button
            onClick={() => { setOrderNumber(null); setMyOrderId(null); setOrderStatus(null); }}
            className="bg-gray-800 text-white px-6 py-2 rounded-xl text-sm font-bold"
          >
            新しい注文をする
          </button>
        )}
      </main>
    )
  }

  return (
    <main className="max-w-md mx-auto p-4 bg-gray-50 min-h-screen pb-20">
      <header className="mb-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900">2-12 モバイルオーダー</h1>
        <p className="text-sm text-gray-700 font-medium mb-3">お好きなメニューを選んで注文してください</p>
        
        <button
          onClick={() => setIsLocationModalOpen(true)}
          className="bg-blue-50 text-blue-700 border border-blue-200 px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1 shadow-sm hover:bg-blue-100"
        >
          📍 店の場所・アクセスを確認する
        </button>
      </header>

      <div className="space-y-4">
        {menus.map((menu) => (
          <div key={menu.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 items-center">
            <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
              {menu.image_url ? (
                <img src={menu.image_url} alt={menu.name} className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-gray-500 font-semibold">No Image</div>
              )}
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-gray-900">{menu.name}</h2>
              <p className="text-orange-600 font-extrabold">¥{menu.price}</p>
              <div className="mt-1">
                {menu.stock_status === 'abundance' && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">余裕あり</span>}
                {menu.stock_status === 'low' && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-bold">残りわずか</span>}
                {menu.stock_status === 'sold_out' && <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold">在庫なし</span>}
              </div>
            </div>
            <div>
              <button
                disabled={menu.stock_status === 'sold_out'}
                onClick={() => handleOpenModal(menu)}
                className={`px-4 py-2 rounded-lg text-sm font-bold ${
                  menu.stock_status === 'sold_out' ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                選ぶ
              </button>
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="fixed bottom-4 left-0 right-0 px-4 max-w-md mx-auto">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg flex justify-between px-6 items-center"
          >
            <span>カートを見る ({cart.length}点)</span>
            <span>注文に進む &gt;</span>
          </button>
        </div>
      )}

      {/* 場所確認モーダル */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <h3 className="text-lg font-bold mb-2 text-gray-900">📍 模擬店の場所</h3>
            <div className="bg-gray-100 p-4 rounded-xl my-4 text-sm text-gray-800 space-y-2">
              <p className="font-bold text-base text-orange-600">〇号館 2階 201教室</p>
              <p className="text-xs text-gray-600 font-medium">（中庭側の階段を上ってすぐ右側です）</p>
            </div>
            <p className="text-xs text-gray-700 font-medium mb-6">
              商品が「お渡し準備完了」になったら、こちらの場所まで番号札（スマホ画面）を持って取りにお越しください！
            </p>
            <button
              onClick={() => setIsLocationModalOpen(false)}
              className="w-full bg-gray-800 text-white py-2.5 rounded-xl text-sm font-bold"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* オプション選択モーダル */}
      {selectedMenu && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 text-gray-900">{selectedMenu.name}のオプション</h3>
            {selectedMenu.options?.map((opt) => (
              <div key={opt.name} className="mb-4">
                <label className="text-sm font-bold text-gray-800 block mb-2">{opt.name}</label>
                
                {opt.type === 'multiple' ? (
                  <div className="space-y-2 bg-gray-50 p-3 rounded-lg border">
                    {opt.choices.map((choice) => {
                      const currentList = (selectedOptions[opt.name] as string[]) || []
                      const isChecked = currentList.includes(choice)
                      return (
                        <label key={choice} className="flex items-center gap-2 text-sm text-gray-800 font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => handleCheckboxChange(opt.name, choice, e.target.checked)}
                            className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
                          />
                          {choice}
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <select
                    value={(selectedOptions[opt.name] as string) || ''}
                    onChange={(e) => setSelectedOptions({ ...selectedOptions, [opt.name]: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white font-medium text-gray-900"
                  >
                    {opt.choices.map((choice) => (
                      <option key={choice} value={choice}>{choice}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
            <div className="flex gap-2 mt-6">
              <button onClick={() => setSelectedMenu(null)} className="flex-1 bg-gray-200 py-2 rounded-lg text-sm font-bold text-gray-800">キャンセル</button>
              <button onClick={handleAddToCart} className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm font-bold">カートに入れる</button>
            </div>
          </div>
        </div>
      )}

      {/* カート確認モーダル */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-55">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-bold mb-4 text-gray-900">注文内容の確認</h3>
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {cart.map((item, index) => (
                <div key={index} className="border-b pb-2 flex justify-between items-center text-sm">
                  <div>
                    <p className="font-bold text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-700 font-medium">
                      {Object.entries(item.selectedOptions).map(([k, v]) => 
                        `${k}: ${Array.isArray(v) ? v.join(', ') : v}`
                      ).join(' / ')}
                    </p>
                  </div>
                  <p className="font-bold text-gray-900">¥{item.price}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsCartOpen(false)} className="flex-1 bg-gray-200 py-2 rounded-lg text-sm font-bold text-gray-800">もどる</button>
              <button onClick={handleCheckout} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-bold">注文を確定する</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
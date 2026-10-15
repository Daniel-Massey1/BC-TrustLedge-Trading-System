// Sample listings until the API exists
export const mockListings = [
  {
    id: 1,
    title: 'Sony WH-1000XM4 headphones',
    description: 'Noise-cancelling headphones in good condition. Comes with the case and charging cable.',
    price: '0.045',
    seller: '0x3fA2…9c1E',
    status: 'active', // 'active' | 'reserved' | 'sold'
  },
  {
    id: 2,
    title: 'Vintage denim jacket',
    description: 'Size M, light wash. Some fading on the sleeves but no rips or stains.',
    price: '0.012',
    seller: '0x81bD…44a0',
    status: 'active',
  },
  {
    id: 3,
    title: 'Nintendo Switch Lite',
    description: 'Turquoise, barely used. Includes the charger, no games.',
    price: '0.060',
    seller: '0x5C09…e7B3',
    status: 'active',
  },
  {
    id: 4,
    title: 'Desk lamp, warm white',
    description: 'Adjustable arm and three brightness levels. Works perfectly.',
    price: '0.006',
    seller: '0xA7e1…0d2F',
    status: 'active',
  },
  {
    id: 5,
    title: 'Mechanical keyboard',
    description: 'Brown switches, full size. Already sold, so it should not show on Browse.',
    price: '0.030',
    seller: '0x2bE4…71Cc',
    status: 'sold',
  },
]

const ETH_TO_NZD = 6000

export function toNZD(price) {
  return (Number(price) * ETH_TO_NZD).toLocaleString('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  })
}

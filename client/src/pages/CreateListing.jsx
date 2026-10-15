import { useEffect, useState } from 'react'
import { useWallet } from '../wallet/useWallet'
import { LoginPage } from '../wallet/LoginPage'

function CreateListing({ setPage, setMessage }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [image, setImage] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // The connected MetaMask wallet is the seller
  const { account: sellerWallet } = useWallet()

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function handleImage(e) {
    const file = e.target.files[0]
    if (!file) return

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Please select a JPG or PNG image')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5 MB')
      return
    }

    setError('')
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!title.trim() || !price || Number(price) <= 0) {
      setError('Please enter a valid title and price')
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()

      formData.append('seller_wallet', sellerWallet)
      formData.append('title', title.trim())
      formData.append('description', description.trim())
      formData.append('category', 'Other')
      formData.append('price', price)

      if (image) {
        formData.append('image', image)
      }

      const response = await fetch('http://localhost:3001/api/listings', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create listing')
      }

      setMessage('Listing created successfully!')
      setPage('browse')
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not create listing')
    } finally {
      setLoading(false)
    }
  }

  // Only logged-in users can post a listing (FR2)
  if (!sellerWallet) return <LoginPage action="create a listing" />

  return (
    <>
      <h2>Create listing</h2>

      <form className="listing-form" onSubmit={handleSubmit}>
        <label>
          Title
          <input
            type="text"
            required
            placeholder="e.g. Watch"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label>
          Description
          <textarea
            rows="5"
            required
            placeholder="Insert description here"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label>
          Price
          <span className="price-input">
            <input
              type="number"
              min="0.001"
              step="0.001"
              placeholder="e.g. 0.001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
            SepoliaETH
          </span>
        </label>

        <label>
          Image
          <span className="image-box">
            {preview ? (
              <img src={preview} alt="Selected item" />
            ) : (
              <span>Click to choose an image</span>
            )}
            <input
              type="file"
              accept="image/png, image/jpeg"
              onChange={handleImage}
            />
          </span>
        </label>

        {error && (
          <p role="alert" style={{ color: 'red' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn submit-btn"
          disabled={loading}
        >
          {loading ? 'Uploading...' : 'Upload listing'}
        </button>
      </form>
    </>
  )
}

export default CreateListing

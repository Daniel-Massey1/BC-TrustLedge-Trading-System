import { useState } from 'react'

function CreateListing({ setPage, setMessage }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [image, setImage] = useState(null) 
  const [preview, setPreview] = useState(null) 

  function handleImage(e) {
    const file = e.target.files[0]
    if (!file) return

    if (preview) URL.revokeObjectURL(preview) 
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }

  function handleSubmit(e) {
    e.preventDefault()

    const listing = { title, description, price, image }

    // TODO: send to the API once it exists
    console.log('New listing:', listing)

    if (preview) URL.revokeObjectURL(preview)
    setPage('browse') 

    setMessage('Listing created')
    setTimeout(() => setMessage(''), 3000)
  }

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
              required
              step="0.001"
              placeholder="e.g. 0.001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
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
            <input type="file" accept="image/png, image/jpeg" onChange={handleImage} />
          </span>
        </label>

        <button type="submit" className="btn submit-btn">
          Upload listing
        </button>
      </form>
    </>
  )
}

export default CreateListing

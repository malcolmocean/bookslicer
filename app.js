document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('dropZone')
  const fileInput = document.getElementById('fileInput')
  const chaptersList = document.getElementById('chaptersList')
  const extractButton = document.getElementById('extractButton')
  const copyButton = document.getElementById('copyButton')
  const downloadButton = document.getElementById('downloadButton')
  const output = document.getElementById('output')
  console.log('output element:', output)
  console.log('output element query:', document.getElementById('output'))
  const loading = document.getElementById('loading')
  
  let book = null
  let chapters = []
  
  // Handle drag and drop events
  ;['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false)
  })
  
  function preventDefaults(e) {
    e.preventDefault()
    e.stopPropagation()
  }
  
  ;['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('dragover')
    })
  })
  
  ;['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('dragover')
    })
  })
  
  // Handle file selection
  dropZone.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', handleFileSelect)
  dropZone.addEventListener('drop', handleDrop)
  
  function handleDrop(e) {
    const dt = e.dataTransfer
    const files = dt.files
    handleFiles(files)
  }
  
  function handleFileSelect(e) {
    const files = e.target.files
    handleFiles(files)
  }
  
  async function handleFiles(files) {
    if (!files.length) {return}
    if (files[0].type.includes('epub')) {
      const file = files[0]
      loading.style.display = 'block'
      chaptersList.innerHTML = ''
      output.style.display = 'none'
      extractButton.disabled = true
      copyButton.disabled = true
      downloadButton.disabled = true
      
      try {
        const arrayBuffer = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = e => resolve(e.target.result)
          reader.onerror = reject
          reader.readAsArrayBuffer(file)
        })
        
        console.log('ArrayBuffer loaded, size:', arrayBuffer.byteLength)
        
        book = ePub()
        console.log('Book object created:', book)
        
        await book.open(arrayBuffer)
        console.log('Book opened, spine items:', book.spine?.spineItems?.length)
        console.log('Book archive:', book.archive)
        
        // Flatten the navigation items into an array
        const navigation = await book.loaded.navigation
        console.log('Navigation loaded:', navigation)
        
        const tocArray = []
        const flattenToc = (items) => {
          items.forEach(item => {
            tocArray.push(item)
            if (item.subitems && item.subitems.length) {
              flattenToc(item.subitems)
            }
          })
        }
        flattenToc(navigation.toc)
        
        chapters = []
        
        // Get all spine items
        const spineItems = book.spine.spineItems
        
        for (let i = 0; i < spineItems.length; i++) {
          const item = spineItems[i]
          console.log('Processing spine item:', {
            href: item.href,
            id: item.id,
            index: i
          })
          
          try {
            // Get chapter content using the book's archive
            console.log('About to get text for href:', item.href)
            const fullPath = `OEBPS/${item.href}`
            console.log('Full path:', fullPath)
            console.log('Available files:', Object.keys(book.archive.zip.files))
            
            const content = await new Promise((resolve, reject) => {
              const zipFile = book.archive.zip.files[fullPath]
              if (!zipFile) {
                console.warn(`File not found in zip: ${fullPath}`)
                return resolve('')
              }
              zipFile.async('string')
                .then(resolve)
                .catch(reject)
            })
            console.log('Raw content from archive:', content?.substring(0, 100))
            let text = ''
            
            // Create a temporary div to parse HTML content
            const temp = document.createElement('div')
            temp.innerHTML = content
            console.log('Temp div content:', temp.innerHTML?.substring(0, 100))
            
            // Remove script tags for safety
            temp.querySelectorAll('script').forEach(script => script.remove())
            
            text = temp.textContent || ''
            console.log('Text after textContent:', text?.substring(0, 100))
            text = text.trim()
            console.log('Text after trim:', text?.substring(0, 100))
            
            // Try to get title from toc
            let title = `Chapter ${i + 1}`
            const matchingTocItem = tocArray.find(t => t.href.includes(item.href))
            if (matchingTocItem) {
              title = matchingTocItem.label
            }
            
            const tokenEstimate = Math.ceil(text.length / 4)
            
            if (text) { // Only add chapters that have content
              const chapter = {
                id: item.href,
                title: title,
                text: text,
                tokenEstimate: tokenEstimate
              }
              console.log('Pushing chapter:', {
                id: chapter.id,
                title: chapter.title,
                textLength: chapter.text?.length,
                textPreview: chapter.text?.substring(0, 100)
              })
              chapters.push(chapter)
            }
          } catch (err) {
            console.warn(`Error loading chapter ${i}:`, err)
          }
        }
        
        displayChapters()
        extractButton.disabled = false
      } catch (error) {
        console.error('Error processing EPUB:', error)
        chaptersList.innerHTML = '<p style="color: red;">Error processing EPUB file. Please try another file.</p>'
      } finally {
        loading.style.display = 'none'
      }
    } else {
      alert('Please select an EPUB file.')
    }
  }
  
  function displayChapters() {
    function buildTocHtml(items, level = 0) {
      return `
                <ul class="chapter-list ${level > 0 ? 'sublist' : ''}">
                    ${items.map((item, index) => {
      const hasSubitems = item.subitems && item.subitems.length > 0
      const id = `toc-${level}-${index}`
      
      return `
                            <li class="chapter-item">
                                <div class="chapter-row">
                                    ${hasSubitems ? 
      `<button class="collapse-button" aria-expanded="true">▼</button>` : 
      `<span class="collapse-spacer"></span>`
      }
                                    <input type="checkbox" 
                                           id="${id}" 
                                           data-href="${item.href}"
                                           class="toc-checkbox"
                                           ${hasSubitems ? 'data-is-section="true"' : ''}>
                                    <label for="${id}">${item.label}</label>
                                </div>
                                ${hasSubitems ? buildTocHtml(item.subitems, level + 1) : ''}
                            </li>
                        `
    }).join('')}
                </ul>
            `
  }
  
  // Create a map of href to chapter content
  const chapterMap = new Map(
    chapters.map(chapter => [chapter.id, chapter])
  )
  
  chaptersList.innerHTML = buildTocHtml(book.navigation.toc)
  
  // Add event listeners for section checkboxes
  chaptersList.querySelectorAll('input[data-is-section="true"]').forEach(sectionCheckbox => {
    sectionCheckbox.addEventListener('change', (e) => {
      const parentLi = e.target.closest('.chapter-item')
      const subCheckboxes = parentLi.querySelectorAll('input[type="checkbox"]')
      subCheckboxes.forEach(checkbox => {
        checkbox.checked = e.target.checked
      })
    })
  })
  
  // Add event listeners for collapse buttons
  chaptersList.querySelectorAll('.collapse-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const li = e.target.closest('.chapter-item')
      const sublist = li.querySelector('.sublist')
      const isExpanded = e.target.getAttribute('aria-expanded') === 'true'
      
      if (isExpanded) {
        e.target.textContent = '▶'
        e.target.setAttribute('aria-expanded', 'false')
        sublist.style.display = 'none'
      } else {
        e.target.textContent = '▼'
        e.target.setAttribute('aria-expanded', 'true')
        sublist.style.display = 'block'
      }
    })
  })
}

// Extract selected chapters
extractButton.addEventListener('click', () => {
  console.log('Extract button clicked')
  console.log('output element in click handler:', output)
  
  const selectedHrefs = Array.from(chaptersList.querySelectorAll('input[type="checkbox"]:checked'))
    .map(checkbox => checkbox.dataset.href)
    .filter(href => href)
  
  console.log('Selected hrefs:', selectedHrefs)
  
  if (selectedHrefs.length === 0) {
    alert('Please select at least one chapter.')
    return
  }
  
  const extractedText = selectedHrefs
    .map(href => {
      const chapter = chapters.find(ch => ch.id === href)
      console.log('Found chapter:', chapter)
      return chapter ? chapter.text : ''
    })
    .filter(text => text)
    .join('\n\n')
    .replace(/\s+/g, ' ')
    .trim()
  
  console.log('Extracted text length:', extractedText.length)
  
  output.textContent = extractedText
  output.style.display = 'block'
  copyButton.disabled = false
  downloadButton.disabled = false
})

// Copy to clipboard
copyButton.addEventListener('click', () => {
  navigator.clipboard.writeText(output.textContent)
  .then(() => alert('Text copied to clipboard!'))
  .catch(err => console.error('Failed to copy text:', err))
})

// Download text file
downloadButton.addEventListener('click', () => {
  const blob = new Blob([output.textContent], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'extracted_chapters.txt'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
})
})

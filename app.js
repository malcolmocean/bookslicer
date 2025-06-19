document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('dropZone')
  const fileInput = document.getElementById('fileInput')
  const chaptersList = document.getElementById('chaptersList')
  const actions = document.getElementById('actions')
  const copyButton = document.getElementById('copyButton')
  const downloadButton = document.getElementById('downloadButton')
  const selectAllButton = document.getElementById('selectAllButton')
  const output = document.getElementById('output')
  console.log('output element:', output)
  console.log('output element query:', document.getElementById('output'))
  const loading = document.getElementById('loading')
  
  let book = null
  let outputText = ''
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
        
        // Debug: Log all TOC and spine items to understand the structure
        console.log('All TOC items:', tocArray.map(t => ({ href: t.href, label: t.label })))
        console.log('All spine items:', book.spine.spineItems.map(s => ({ href: s.href, id: s.id })))
        
        chapters = []
        
        // Create chapters for all TOC items (both full chapters and subsections)
        for (let i = 0; i < tocArray.length; i++) {
          const tocItem = tocArray[i]
          console.log('Processing TOC item:', {
            href: tocItem.href,
            label: tocItem.label,
            index: i
          })
          
          try {
            // Extract the base file path (without fragment)
            const baseHref = tocItem.href.split('#')[0]
            
            // More robust spine item matching
            const spineItem = findMatchingSpineItem(baseHref, book.spine.spineItems)
            
            if (!spineItem) {
              console.warn(`No spine item found for TOC item: ${tocItem.href}`)
              // Try to load the file directly using the TOC href
              const directContent = await tryLoadFileDirectly(tocItem.href, book.archive)
              if (directContent) {
                console.log('Successfully loaded file directly for:', tocItem.href)
                const text = extractTextFromContent(directContent, tocItem.href)
                if (text) {
                  const chapter = {
                    id: tocItem.href,
                    title: tocItem.label,
                    text: text,
                  }
                  chapters.push(chapter)
                }
              }
              continue
            }
            
            // they don't all use OEBPS
            let mainFolderName = '' // just in root dir
            if (/OEBPS\//.test(Object.keys(book.archive.zip.files).toString())) {
              mainFolderName = 'OEBPS/'
            } else if (/OPS\//.test(Object.keys(book.archive.zip.files).toString())) {
              mainFolderName = 'OPS/'
            }

            // Get chapter content using the book's archive
            console.log('About to get text for href:', spineItem.href)
            const fullPath = `${mainFolderName}${spineItem.href}`
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
            
            const text = extractTextFromContent(content, tocItem.href)
            
            console.log('Text after processing:', text?.substring(0, 100))
            console.log('Text after trim:', text?.substring(0, 100))
            
            if (text) { // Only add chapters that have content
              const chapter = {
                id: tocItem.href,
                title: tocItem.label,
                text: text,
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
        dropZone.style.display = 'none'
        selectAllButton.style.display = 'inline-block'
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
  
  // Helper function to find matching spine item with various strategies
  function findMatchingSpineItem(tocHref, spineItems) {
    // Strategy 1: Direct match
    let match = spineItems.find(spine => spine.href === tocHref)
    if (match) return match
    
    // Strategy 2: Match without fragments
    match = spineItems.find(spine => {
      const spineHref = spine.href.split('#')[0]
      const tocHrefClean = tocHref.split('#')[0]
      return spineHref === tocHrefClean
    })
    if (match) return match
    
    // Strategy 3: Match by filename (ignoring directory differences)
    const tocFilename = tocHref.split('/').pop().split('#')[0]
    match = spineItems.find(spine => {
      const spineFilename = spine.href.split('/').pop().split('#')[0]
      return spineFilename === tocFilename
    })
    if (match) return match
    
    // Strategy 4: Match by filename with different extensions
    const tocFilenameNoExt = tocFilename.split('.')[0]
    match = spineItems.find(spine => {
      const spineFilename = spine.href.split('/').pop().split('#')[0]
      const spineFilenameNoExt = spineFilename.split('.')[0]
      return spineFilenameNoExt === tocFilenameNoExt
    })
    if (match) return match
    
    // Strategy 5: Case-insensitive filename match
    match = spineItems.find(spine => {
      const spineFilename = spine.href.split('/').pop().split('#')[0].toLowerCase()
      return spineFilename === tocFilename.toLowerCase()
    })
    if (match) return match
    
    return null
  }
  
  // Helper function to try loading a file directly from the archive
  async function tryLoadFileDirectly(href, archive) {
    const possiblePaths = [
      href,
      `OEBPS/${href}`,
      `EPUB/${href}`,
      href.replace('.xhtml', '.html'),
      href.replace('.html', '.xhtml'),
      `OEBPS/${href.replace('.xhtml', '.html')}`,
      `OEBPS/${href.replace('.html', '.xhtml')}`,
      `EPUB/${href.replace('.xhtml', '.html')}`,
      `EPUB/${href.replace('.html', '.xhtml')}`
    ]
    
    for (const path of possiblePaths) {
      const zipFile = archive.zip.files[path]
      if (zipFile) {
        try {
          const content = await zipFile.async('string')
          console.log(`Successfully loaded file from path: ${path}`)
          return content
        } catch (err) {
          console.warn(`Failed to load file from path: ${path}`, err)
        }
      }
    }
    
    return null
  }
  
  // Helper function to extract text from content
  function extractTextFromContent(content, href) {
    // Create a temporary div to parse HTML content
    const temp = document.createElement('div')
    temp.innerHTML = content
    
    // Remove script tags for safety
    temp.querySelectorAll('script').forEach(script => script.remove())
    
    let text = ''
    
    // If this is a subsection (has fragment), extract just that section
    if (href.includes('#')) {
      const fragment = href.split('#')[1]
      const targetElement = temp.querySelector(`[id="${fragment}"]`) || 
                           temp.querySelector(`[name="${fragment}"]`) ||
                           temp.querySelector(`a[name="${fragment}"]`)
      
      if (targetElement) {
        // Get content from this element to the next section or end
        let sectionText = ''
        let currentElement = targetElement
        
        while (currentElement) {
          // Add newlines between block elements
          if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(currentElement.tagName.toLowerCase())) {
            sectionText += currentElement.textContent + '\n\n'
          } else {
            sectionText += currentElement.textContent
          }
          
          // Move to next sibling, but stop if we hit another section
          currentElement = currentElement.nextElementSibling
          if (currentElement && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(currentElement.tagName.toLowerCase())) {
            break
          }
        }
        
        text = sectionText.trim()
      } else {
        console.warn(`Fragment ${fragment} not found in ${href}`)
        text = temp.textContent || ''
      }
    } else {
      // Full chapter - add newlines between block elements
      const blockElements = temp.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote')
      blockElements.forEach(element => {
        element.insertAdjacentText('afterend', '\n\n')
      })
      
      text = temp.textContent || ''
    }
    
    return text.trim()
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

  // Add event listeners for checkboxes to update sidebar
  chaptersList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', updateSidebar)
  })

  // Add select all functionality
  selectAllButton.addEventListener('click', () => {
    const checkboxes = chaptersList.querySelectorAll('input[type="checkbox"]')
    const anyUnchecked = Array.from(checkboxes).some(checkbox => !checkbox.checked)
    
    checkboxes.forEach(checkbox => {
      checkbox.checked = anyUnchecked
    })
    
    updateSidebar()
  })
}

function extractText() {
  console.log('Extract button clicked')
  console.log('output element in click handler:', output)
  outputText = ''
  
  const selectedHrefs = Array.from(chaptersList.querySelectorAll('input[type="checkbox"]:checked'))
    .map(checkbox => checkbox.dataset.href)
    .filter(href => href)
  
  console.log('Selected hrefs:', selectedHrefs)
  
  if (selectedHrefs.length === 0) {
    output.textContent = '🤨 Please select at least one chapter.'
    output.style.display = 'block'
    return
  }

  // Build table of contents with icons
  function buildTocWithIcons(items, selectedHrefs, level = 0) {
    return items.map(item => {
      const hasSubitems = item.subitems && item.subitems.length > 0
      const indent = '  '.repeat(level)
      
      let icon = '❌' // default not selected
      
      if (hasSubitems) {
        const subItemHrefs = getAllHrefs(item.subitems)
        const selectedSubItems = subItemHrefs.filter(href => selectedHrefs.includes(href))
        
        // Check if the parent item itself is selected (if it has an href)
        const parentSelected = item.href && selectedHrefs.includes(item.href)
        
        if (parentSelected) {
          icon = '✅'
        } else if (selectedSubItems.length > 0) {
          icon = '🔷'
        }
      } else if (selectedHrefs.includes(item.href)) {
        icon = '✅'
      }
      
      let result = `${indent}- ${icon} ${item.label.trim()}\n`
      
      if (hasSubitems) {
        result += buildTocWithIcons(item.subitems, selectedHrefs, level + 1)
      }
      
      return result
    }).join('')
  }

  function getAllHrefs(items) {
    let hrefs = []
    items.forEach(item => {
      if (item.href) hrefs.push(item.href)
      if (item.subitems) hrefs = hrefs.concat(getAllHrefs(item.subitems))
    })
    return hrefs
  }

  const tocWithIcons = buildTocWithIcons(book.navigation.toc, selectedHrefs)
  
  const extractedText = selectedHrefs
    .map(href => {
      const chapter = chapters.find(ch => ch.id === href)
      console.log('Found chapter:', chapter)
      return chapter ? chapter.text : ''
    })
    .filter(text => text)
    .join('\n\n')
    .replace(/\n\s*\n+/g, '\n\n')
    .replace(/\/\*\s*<!\[CDATA\[\s*\*\/([\s\S]*?)\/\*\s*\]\]>\s*\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
  
  console.log('Extracted text length:', extractedText.length)
  
  // Combine TOC with extracted text
  outputText = `This text is excerpted from *${book.packaging.metadata.title}* by ${book.packaging.metadata.creator}
  Here is the full Table of Contents, with checkmark icons indicating which sections
  of the original are included:\n\n${tocWithIcons}\n\n---\n\n${extractedText}`
  
  output.textContent = outputText
  output.style.display = 'block'
  copyButton.disabled = false
  downloadButton.disabled = false
}

function updateSidebar() {
  extractText()

  console.log('output.textContent', output.textContent)
  console.log('outputText', outputText)
  const totalTokens = Math.ceil(outputText.length / 4)
  console.log('totalTokens', totalTokens)

  // Update token count display
  const tokenCount = document.getElementById('tokenCount')
  if (totalTokens > 0) {
    tokenCount.textContent = `Estimated tokens: ${totalTokens.toLocaleString()}`
    tokenCount.style.display = 'block'
  } else {
    tokenCount.style.display = 'none'
  }

  // Show actions if any chapters are selected
  const selectedChapters = document.querySelectorAll('.toc-checkbox:checked')
  actions.style.visibility = selectedChapters.length > 0 ? 'visible' : 'hidden'
  console.log('actions.style.visibility', actions.style.visibility)
}

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
  let filename = book.packaging.metadata.title
  filename += ' EXCERPTS' // would be cool to do something even smarter like (ch1-5,8,10) but this is hard given that not all epubs number chapters etc
  // examples: never-pay-the-first-bill-sections1&3
  a.download = filename+'.txt' // ultimately do markdown
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
})
})

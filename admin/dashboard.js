const BACKEND_URL = "https://immigration-backend-gj2j.onrender.com"; // backend URL

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createBlogHTML(blog) {
  const truncated = blog.content.length > 300;
  const shortText = escapeHTML(blog.content.slice(0, 300));
  const fullText = escapeHTML(blog.content);

  return `
    <div class="blog-card" data-id="${blog._id}">
      <img class="blog-image" src="${blog.imageUrl || ''}" alt="Blog Image" />
      <div class="blog-content-wrapper">
        <h3>${escapeHTML(blog.title || "Untitled")}</h3>
        <p><strong>Date:</strong> ${blog.createdAt ? new Date(blog.createdAt).toLocaleDateString() : "N/A"}</p>
        <p class="blog-content">
          <span class="short">${shortText}${truncated ? '...' : ''}</span>
          ${truncated ? `<span class="full" style="display:none;">${fullText}</span>
          <button class="toggle-content">Read More</button>` : ''}
        </p>
      </div>
    </div>

      <form class="editBlogForm" enctype="multipart/form-data">
        <input type="text" name="title" value="${escapeHTML(blog.title)}" required>
        <textarea name="content" required>${escapeHTML(blog.content)}</textarea>
        <input type="hidden" name="image" value="${blog.imageUrl}">
        <input type="file" name="image">
        <input type="date" name="date" value="${new Date(blog.createdAt).toISOString().split('T')[0]}" required>
        <button type="submit">Update</button>
      </form>

      <button class="deleteBlogBtn" style="background:red;">Delete</button>
    </div>
  `;
}


// Fetch and render blogs
function loadBlogs() {
  fetch(`${BACKEND_URL}/blogs`, {credentials: "include"})
    .then(res => res.json())
    .then(data => {
      const blogListDiv = document.getElementById('blogsList');
      blogListDiv.innerHTML = '';
      data.forEach(blog => blogListDiv.innerHTML += createBlogHTML(blog));
      attachBlogEvents();
    })
    .catch(err => console.error("Error fetching blogs:", err));
}

// Attach Edit/Delete and Read More events
function attachBlogEvents() {
  document.querySelectorAll('.toggle-content').forEach(btn => {
    btn.addEventListener('click', function () {
      const parent = this.parentElement;
      const short = parent.querySelector('.short');
      const full = parent.querySelector('.full');
      const isExpanded = full.style.display === 'inline';

      short.style.display = isExpanded ? 'inline' : 'none';
      full.style.display = isExpanded ? 'none' : 'inline';
      this.textContent = isExpanded ? 'Read More' : 'Read Less';
    });
  });

  document.querySelectorAll('.editBlogForm').forEach(form => {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const blogId = this.closest('.blog-card').dataset.id;
      const formData = new FormData(this);

      fetch(`${BACKEND_URL}/edit-blog/${blogId}`, {
        method: 'POST',
        credentials: "include",
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        alert(data.message);
        loadBlogs();
      })
      .catch(err => console.error("Error updating blog:", err));
    });
  });

  document.querySelectorAll('.deleteBlogBtn').forEach(btn => {
    btn.addEventListener('click', function () {
      const blogId = this.closest('.blog-card').dataset.id;
      if (!confirm("Are you sure you want to delete this blog?")) return;

      fetch(`${BACKEND_URL}/delete-blog/${blogId}`, { method: 'POST', credentials: "include" })
        .then(res => res.json())
        .then(data => {
          alert(data.message);
          loadBlogs();
        })
        .catch(err => console.error("Error deleting blog:", err));
    });
  });
}

// Add blog form
document.getElementById('addBlogForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const formData = new FormData(this);

  fetch(`${BACKEND_URL}/add-blog`, { method: 'POST', body: formData, credentials: "include" })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      this.reset();
      loadBlogs();
    })
    .catch(err => console.error("Error adding blog:", err));
});

// Initial load
loadBlogs();
/* eslint-disable no-undef, no-unused-vars */

async function loadProducts() {
  try {
    const res = await fetch('/api/products?shop_name=' + encodeURIComponent(shopName));
    const data = await res.json();
    
    const select = document.getElementById('productSelect');
    select.innerHTML = '<option value="">商品を選択してください</option>';
    
    data.products.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.title + ' (在庫: ' + p.inventory_quantity + '個)';
      select.appendChild(option);
    });
  } catch (error) {
    alert('商品一覧の取得に失敗しました');
  }
}

function openAddModal() {
  document.getElementById('addModal').style.display = 'block';
  loadProducts();
}

function closeAddModal() {
  document.getElementById('addModal').style.display = 'none';
}

function openEditModal(id, threshold, isActive) {
  document.getElementById('editId').value = id;
  document.getElementById('editThreshold').value = threshold;
  document.getElementById('editActive').value = isActive.toString();
  document.getElementById('editModal').style.display = 'block';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const productId = document.getElementById('productSelect').value;
  const threshold = parseInt(document.getElementById('addThreshold').value);
  
  try {
    const res = await fetch('/alert-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_name: shopName,
        product_id: parseInt(productId),
        threshold: threshold
      })
    });
    
    if (res.ok) {
      alert('アラート設定を追加しました');
      location.reload();
    } else {
      const error = await res.json();
      alert('エラー: ' + error.error);
    }
  } catch (error) {
    alert('追加に失敗しました');
  }
});

document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('editId').value;
  const threshold = parseInt(document.getElementById('editThreshold').value);
  const isActive = document.getElementById('editActive').value === 'true';
  
  try {
    const res = await fetch('/alert-settings/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threshold: threshold,
        is_active: isActive
      })
    });
    
    if (res.ok) {
      alert('アラート設定を更新しました');
      location.reload();
    } else {
      const error = await res.json();
      alert('エラー: ' + error.error);
    }
  } catch (error) {
    alert('更新に失敗しました');
  }
});

async function deleteSetting(id) {
  if (!confirm('本当に削除しますか？')) return;
  
  try {
    const res = await fetch('/alert-settings/' + id, {
      method: 'DELETE'
    });
    
    if (res.ok) {
      alert('アラート設定を削除しました');
      location.reload();
    } else {
      const error = await res.json();
      alert('エラー: ' + error.error);
    }
  } catch (error) {
    alert('削除に失敗しました');
  }
}

window.onclick = function(event) {
  if (event.target.classList.contains('modal')) {
    event.target.style.display = 'none';
  }
}
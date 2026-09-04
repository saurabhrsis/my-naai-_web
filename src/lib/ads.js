// Advertisement carousel helpers. The mobile NaaiDashboard reads
// `response.data.images` from GET /api/advertisement/get-advertisement and
// renders each entry as `${server}/getfiles/${item}` with no overlay copy.

function readImagePath(item) {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  const value = item.imageUrl || item.image || item.url || item.path || item.src || item.fileName || item.filename || item.file || '';
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeAdImages(response) {
  const buckets = [
    response?.data?.images,
    response?.data?.advertisements,
    response?.data?.ads,
    response?.images,
    Array.isArray(response?.data) ? response.data : null,
    Array.isArray(response) ? response : null,
  ];
  const list = buckets.find(Array.isArray) || [];
  return list.map(readImagePath).filter(Boolean);
}

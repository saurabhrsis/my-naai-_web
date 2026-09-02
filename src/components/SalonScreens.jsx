import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crown,
  Edit3,
  History,
  ImagePlus,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Scissors,
  Store,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { api, getFileUrl, setToken } from '../lib/api';
import { DEFAULT_SERVICES, DEMO_HISTORY, DEMO_NOTIFICATIONS, DEMO_PRODUCTS, DEMO_QUEUE, DEMO_SALON_PROFILE } from '../lib/demoData';
import { io } from 'socket.io-client';
import {
  Button,
  EmptyState,
  Field,
  GOLD,
  ImageWithFallback,
  Modal,
  PageHeader,
  Rating,
  SelectField,
  SkeletonCard,
  Spinner,
  StatCard,
  StatusPill,
  Toggle,
  cx,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatTime,
  getBrowserLocation,
  getErrorMessage,
  getInitials,
  getSalonStatus,
} from './Shared';

function getList(response, keys = []) {
  if (Array.isArray(response?.data)) return response.data;
  for (const key of keys) if (Array.isArray(response?.data?.[key])) return response.data[key];
  return [];
}

function isSameDate(value, offset = 0) {
  if (!value) return false;
  const target = new Date(Date.now() + offset * 86400000);
  const targetString = target.toISOString().slice(0, 10);
  return String(value).slice(0, 10) === targetString;
}

/*
 * Walk-in customer flow is intentionally disabled for the web portal.
 * The original implementation is retained here for a future re-enable, but
 * there is no Walk-in action or modal in the salon queue UI.
 *
function WalkInModal({ open, onClose, session, notify, onAdded }) {
  const [customerName, setCustomerName] = useState('');
  const [duration, setDuration] = useState('30');
  const [barberId, setBarberId] = useState('');
  const [barbers, setBarbers] = useState(session.demo ? DEMO_SALON_PROFILE.barbers : []);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open || session.demo) return;
    api.getBarbersList({ salonId: session.userId }).then(response => setBarbers(getList(response))).catch(error => { console.debug(getErrorMessage(error, 'Unable to load specialists.')); });
  }, [open, session.demo, session.userId]);
  useEffect(() => { if (!open) { setCustomerName(''); setDuration('30'); setBarberId(''); } }, [open]);
  const add = async event => {
    event.preventDefault();
    if (!customerName.trim() || !duration) return notify?.('error', 'Enter a customer name and service duration.');
    setSaving(true);
    try {
      if (!session.demo) {
        const payload = { customerName: customerName.trim(), serviceDuration: Number(duration) };
        if (barberId) payload.barberId = String(barberId);
        const response = await api.walkInBooking(payload);
        if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Could not add walk-in.');
      }
      onAdded?.({ bookingId: `walk-in-${Date.now()}`, userName: customerName.trim(), serviceNames: `Walk-in · ${duration} min`, bookingDate: new Date().toISOString().slice(0, 10), bookingTime: formatTime(new Date().toTimeString().slice(0, 5)), queueNumber: 'WALK-IN', barberName: barbers.find(item => String(item.barberId || item.id) === String(barberId))?.fullName || '' });
      notify?.('success', 'Walk-in added to the queue.');
      onClose();
    } catch (error) { notify?.('error', getErrorMessage(error, 'Could not add walk-in customer.')); } finally { setSaving(false); }
  };
  return <Modal open={open} onClose={onClose} title="Add walk-in customer"><form className="modal-form" onSubmit={add}><p className="modal-lede">Add an offline customer to today’s live queue.</p><Field label="Customer name"><input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="e.g. Neha Sharma" autoFocus /></Field><div className="form-two-col"><Field label="Duration"><input type="number" min="5" max="180" value={duration} onChange={event => setDuration(event.target.value)} placeholder="30" /></Field><SelectField label="Specialist" value={barberId} onChange={event => setBarberId(event.target.value)} placeholder="Any specialist" options={barbers.map(item => ({ value: String(item.barberId || item.id), label: item.fullName || item.name }))} /></div><div className="form-actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Add to queue <UserPlus size={16} /></Button></div></form></Modal>;
}

*/

export function SalonQueueScreen({ session, navigate, notify }) {
  const isDemo = session.demo;
  const [items, setItems] = useState(isDemo ? DEMO_QUEUE : []);
  const [loading, setLoading] = useState(!isDemo);
  const [refreshing, setRefreshing] = useState(false);
  const [doneId, setDoneId] = useState('');
  const load = useCallback(async (isRefresh = false) => {
    if (isDemo) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try { const response = await api.customerList({ salonId: session.userId, page: 1 }); setItems(getList(response, ['bookings', 'customers'])); } catch (error) { notify?.('error', getErrorMessage(error, 'Unable to load your queue.')); } finally { setLoading(false); setRefreshing(false); }
  }, [isDemo, notify, session.userId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (isDemo) return undefined;
    let socket;
    try { socket = io((import.meta.env.VITE_API_BASE_URL || 'https://backend.mynaai.in').replace(/\/$/, ''), { transports: ['websocket'] }); socket.on('connect', () => socket.emit('join_salon', String(session.userId))); socket.on('queue_updated', () => load()); } catch (error) { console.debug(getErrorMessage(error, 'Live queue updates are unavailable; using refresh.')); /* REST fallback */ }
    return () => socket?.disconnect();
  }, [isDemo, load, session.userId]);
  const markDone = async bookingId => {
    if (!window.confirm('Mark this service as completed?')) return;
    setDoneId(bookingId);
    try { if (!isDemo) { const response = await api.bookingDone({ salonId: session.userId, bookingId }); if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Could not complete service'); } setItems(current => current.filter(item => item.bookingId !== bookingId)); notify?.('success', 'Service marked as completed.'); } catch (error) { notify?.('error', getErrorMessage(error, 'Could not complete service.')); } finally { setDoneId(''); }
  };
  const grouped = [{ label: 'Today', key: 0, items: items.filter(item => isSameDate(item.bookingDate, 0)) }, { label: 'Tomorrow', key: 1, items: items.filter(item => isSameDate(item.bookingDate, 1)) }, { label: 'Day after tomorrow', key: 2, items: items.filter(item => !isSameDate(item.bookingDate, 0) && !isSameDate(item.bookingDate, 1)) }].filter(group => group.items.length);
  return <div className="screen salon-queue-screen"><PageHeader title="Customer queue" subtitle="Keep every chair moving smoothly." action={<div className="page-actions">{/* Walk-in customer entry is intentionally disabled. */}<button className="notification-button" onClick={() => navigate('notifications')} aria-label="Open notifications"><Bell size={18} /></button><button className="refresh-icon-button" onClick={() => load(true)} aria-label="Refresh queue"><Zap size={17} /></button></div>} /><div className="queue-stats"><StatCard icon={UsersRound} label="In queue" value={items.length} note="active appointments" tone="gold" /><StatCard icon={Clock3} label="Next appointment" value={items[0]?.bookingTime ? formatTime(items[0].bookingTime) : '—'} note={items[0]?.userName || 'no wait'} tone="green" /><StatCard icon={CalendarCheck2} label="Today" value={items.filter(item => isSameDate(item.bookingDate, 0)).length} note="appointments" /></div>{loading ? <div className="list-stack">{[1, 2, 3, 4].map(item => <SkeletonCard key={item} className="queue-skeleton" />)}</div> : grouped.length ? <div className="queue-groups">{grouped.map(group => <section className="queue-group" key={group.label}><div className="queue-group-heading"><h2>{group.label}</h2><span>{group.items.length} {group.items.length === 1 ? 'booking' : 'bookings'}</span></div>{group.items.map(item => <article className="queue-card" key={item.bookingId}>{/* Queue token number intentionally hidden. */}<div className="queue-main"><div className="queue-card-heading"><div><h3>{item.userName || 'Guest'}</h3><span>{item.bookingDate ? `${formatDate(item.bookingDate)} · ${formatTime(item.bookingTime)}` : 'Appointment time pending'}</span></div><Button size="small" onClick={() => markDone(item.bookingId)} loading={doneId === item.bookingId}>Done</Button></div><div className="queue-meta"><span><Scissors size={14} /> {item.serviceNames || item.services || 'Salon service'}</span>{item.barberName && <span><UserRound size={14} /> {item.barberName}</span>}{item.userPhone && item.userPhone !== '0000000000' && <a href={`tel:${item.userPhone}`}><Phone size={14} /> {item.userPhone}</a>}</div></div></article>)}</section>)}</div> : <EmptyState icon={UsersRound} title="No customers in queue" message="New booking requests will appear here." />}{/* Walk-in customer modal intentionally disabled. */}</div>;
}

export function SalonHistoryScreen({ session, notify }) {
  const isDemo = session.demo;
  const [items, setItems] = useState(isDemo ? DEMO_HISTORY : []);
  const [loading, setLoading] = useState(!isDemo);
  const load = useCallback(async () => { if (isDemo) return; setLoading(true); try { const response = await api.salonQueueHistory(); setItems(response?.bookings || getList(response, ['bookings'])); } catch (error) { notify?.('error', getErrorMessage(error, 'Unable to load booking history.')); } finally { setLoading(false); } }, [isDemo, notify]);
  useEffect(() => { load(); }, [load]);
  return <div className="screen history-screen"><PageHeader title="Customer history" subtitle="A record of the work you have completed." action={<button className="refresh-text-button" onClick={load}><History size={15} /> Refresh</button>} />{loading ? <div className="list-stack">{[1, 2, 3, 4].map(item => <SkeletonCard key={item} className="history-skeleton" />)}</div> : items.length ? <div className="history-list">{items.map((item, index) => <article className="history-card" key={item.bookingId || index}><div className="history-avatar">{getInitials(item.userName || 'Guest')}</div><div className="history-copy"><div className="history-heading"><h3>{item.userName || 'Guest'}</h3><span>{formatDate(item.bookingDate)}</span></div><p>{item.services || item.serviceNames || 'Salon service'}</p><div><span><UserRound size={13} /> {item.barberName || 'Any specialist'}</span><span><Clock3 size={13} /> {formatTime(item.bookingTime)}</span></div></div><CheckCircle2 className="history-check" size={19} /></article>)}</div> : <EmptyState icon={History} title="No completed bookings" message="Your completed services will be listed here." />}</div>;
}

function normalizeProduct(item = {}) { return { ...item, id: item.productId || item.id, name: item.productName || item.name || 'Unnamed product', price: item.price || 0, rating: Number(item.rating || 0), available: item.isAvailable ?? item.available ?? true, image: item.productImage || item.image || '' }; }

export function SalonProductsScreen({ session, notify }) {
  const isDemo = session.demo;
  const [products, setProducts] = useState(isDemo ? DEMO_PRODUCTS.map(normalizeProduct) : []);
  const [loading, setLoading] = useState(!isDemo);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const emptyForm = { productName: '', price: '', rating: '0', isAvailable: true, productImage: '', imageFile: null, preview: '' };
  const [form, setForm] = useState(emptyForm);
  const load = useCallback(async () => { if (isDemo) return; setLoading(true); try { const response = await api.salonProductList({}); setProducts(getList(response, ['products']).map(normalizeProduct)); } catch (error) { notify?.('error', getErrorMessage(error, 'Unable to load product catalog.')); } finally { setLoading(false); } }, [isDemo, notify]);
  useEffect(() => { load(); }, [load]);
  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = item => { setEditing(item.id); setForm({ productName: item.name, price: String(item.price), rating: String(item.rating || 0), isAvailable: item.available, productImage: item.image, imageFile: null, preview: item.image ? getFileUrl(item.image) : '' }); setModalOpen(true); };
  const save = async event => {
    event.preventDefault();
    if (!form.productName.trim() || !form.price) return notify?.('error', 'Product name and price are required.');
    setSaving(true);
    try {
      let productImage = form.productImage;
      if (form.imageFile) { const uploaded = await api.uploadImage(form.imageFile); productImage = uploaded?.url || uploaded?.data?.url || uploaded?.path || ''; }
      const payload = { productId: editing || null, productName: form.productName.trim(), price: form.price, rating: Math.min(5, Math.max(0, Number(form.rating) || 0)), isAvailable: form.isAvailable, productImage, phoneNumber: '' };
      if (!isDemo) { const response = editing ? await api.updateProductList(payload) : await api.createProductList(payload); if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Could not save product'); const returned = normalizeProduct(response.data || payload); setProducts(current => editing ? current.map(item => item.id === editing ? { ...returned, id: editing } : item) : [{ ...returned, id: returned.id || `product-${Date.now()}` }, ...current]); } else { const item = { id: editing || `product-${Date.now()}`, name: payload.productName, price: payload.price, rating: payload.rating, available: payload.isAvailable, image: productImage }; setProducts(current => editing ? current.map(value => value.id === editing ? item : value) : [item, ...current]); }
      setModalOpen(false); notify?.('success', editing ? 'Product updated.' : 'Product added.');
    } catch (error) { notify?.('error', getErrorMessage(error, 'Could not save product.')); } finally { setSaving(false); }
  };
  const remove = async item => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try { if (!isDemo) { const response = await api.deleteProduct(item.id); if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Could not delete product'); } setProducts(current => current.filter(value => value.id !== item.id)); notify?.('success', 'Product deleted.'); } catch (error) { notify?.('error', getErrorMessage(error, 'Could not delete product.')); }
  };
  const toggle = async item => {
    const next = { ...item, available: !item.available }; setProducts(current => current.map(value => value.id === item.id ? next : value));
    if (!isDemo) { try { await api.updateProductList({ productId: item.id, productName: item.name, price: item.price, rating: item.rating, isAvailable: next.available, productImage: item.image || '' }); } catch (error) { setProducts(current => current.map(value => value.id === item.id ? item : value)); notify?.('error', getErrorMessage(error, 'Availability could not be updated.')); } }
  };
  return <div className="screen salon-products-screen"><PageHeader title="Product catalog" subtitle="Manage the products customers can discover." action={<Button size="small" onClick={openAdd}><Plus size={16} /> Add product</Button>} />{loading ? <div className="product-grid">{[1, 2, 3, 4].map(item => <SkeletonCard key={item} />)}</div> : products.length ? <div className="product-grid salon-product-grid">{products.map(item => <article className="product-card salon-product-card" key={item.id}><div className="product-image-wrap"><ImageWithFallback src={item.image} fallback="/assets/naai/ad2.jpg" alt={item.name} className="product-image" /><span className={cx('stock-label', item.available ? 'in-stock' : 'out-stock')}>{item.available ? 'In stock' : 'Out of stock'}</span></div><div className="product-copy"><h3>{item.name}</h3><div className="product-price-row"><strong>{formatCurrency(item.price)}</strong><Rating value={item.rating} /></div><div className="product-manage-row"><Toggle checked={item.available} onChange={() => toggle(item)} label={item.available ? 'Available' : 'Hidden'} /><div><button className="small-icon-button" onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`}><Pencil size={15} /></button><button className="small-icon-button danger" onClick={() => remove(item)} aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button></div></div></div></article>)}</div> : <EmptyState icon={Package} title="No products yet" message="Add your first product to the customer shelf." action={<Button onClick={openAdd}><Plus size={16} /> Add product</Button>} />}<Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit product' : 'Add product'}><form className="modal-form" onSubmit={save}><Field label="Product image" hint="Optional · JPG or PNG"><label className="image-upload-box">{form.preview ? <img src={form.preview} alt="Product preview" /> : <><ImagePlus size={24} /><span>Choose an image</span></>}<input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) setForm(current => ({ ...current, imageFile: file, preview: URL.createObjectURL(file) })); }} /></label></Field><Field label="Product name"><input value={form.productName} onChange={event => setForm(current => ({ ...current, productName: event.target.value }))} placeholder="e.g. Matte Clay Pomade" autoFocus /></Field><div className="form-two-col"><Field label="Price"><input type="number" min="0" value={form.price} onChange={event => setForm(current => ({ ...current, price: event.target.value }))} placeholder="499" /></Field><Field label="Rating"><input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={event => setForm(current => ({ ...current, rating: event.target.value }))} placeholder="4.8" /></Field></div><div className="switch-form-row"><span><strong>Available for customers</strong><small>Show this product on the shelf</small></span><Toggle checked={form.isAvailable} onChange={value => setForm(current => ({ ...current, isAvailable: value }))} /></div><div className="form-actions"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>{editing ? 'Save changes' : 'Add product'}</Button></div></form></Modal></div>;
}

function normalizeService(item, index) { const id = item.serviceId || item.id || `new-service-${index}`; return { id, serviceId: id, name: item.serviceName || item.name || '', price: item.price === undefined || item.price === null ? '' : String(item.price), duration: String(item.durationMinutes ?? item.duration ?? 30), description: item.description || '' }; }
function normalizeBarber(item, index) { const id = item.barberId || item.id || `new-barber-${index}`; return { id, barberId: id, name: item.fullName || item.name || '', image: item.profileImageUrl || item.image || '', rating: item.ratingAverage ?? item.rating ?? '0.0', isAvailable: item.isAvailable ?? true }; }

export function SalonAccountScreen({ session, navigate, notify, onSessionUpdate }) {
  const isDemo = session.demo;
  const [profile, setProfile] = useState(isDemo ? DEMO_SALON_PROFILE : session.user?.salon || {});
  const [loading, setLoading] = useState(!isDemo);
  const [isOpen, setIsOpen] = useState(Boolean(profile.isOpen));
  const load = useCallback(async () => { if (isDemo) return; setLoading(true); try { const response = await api.salonProfile({ salonId: session.userId }); if (response?.status === 'SUCCESS') { const data = response.data || {}; setProfile(data); setIsOpen(getSalonStatus(data.businessHours, data.isOpen).isOpen); const incomplete = data.profileCompleted === false; onSessionUpdate?.(data, incomplete ? { isNewSalon: true } : undefined); if (incomplete) navigate('editProfile', { isOnboarding: 'true' }, { replace: true }); } } catch (error) { notify?.('error', getErrorMessage(error, 'Unable to load salon profile.')); } finally { setLoading(false); } }, [isDemo, navigate, notify, onSessionUpdate, session.userId]);
  useEffect(() => { load(); }, [load]);
  const toggleOpen = async () => { const next = !isOpen; setIsOpen(next); if (!isDemo) { try { const response = await api.SalonOpenClose({ salonId: session.userId, isOpen: next }); if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Could not update status'); notify?.('success', next ? 'Salon is now open.' : 'Salon is now closed.'); } catch (error) { setIsOpen(!next); notify?.('error', getErrorMessage(error, 'Could not update salon status.')); } } else notify?.('success', next ? 'Salon is now open.' : 'Salon is now closed.'); };
  if (loading) return <div className="screen salon-account-screen"><PageHeader title="Salon account" /><div className="account-loading"><Spinner label="Loading salon profile…" /></div></div>;
  const status = getSalonStatus(profile.businessHours, isOpen);
  const menus = [{ label: 'Edit salon profile', caption: 'Photos, hours, services and specialists', icon: Edit3, route: 'editProfile' }, { label: 'About MyNaai', caption: 'How MyNaai helps your business', icon: Store, route: 'salonAbout' }, { label: 'Frequently asked questions', caption: 'Partner help and booking basics', icon: Bell, route: 'salonFaq' }, { label: 'Terms & conditions', caption: 'Partner terms', icon: Receipt, route: 'salonTerms' }, { label: 'Subscription plans', caption: 'Upgrade or renew your plan', icon: WalletCards, route: 'subscription' }, { label: 'Need a hand?', caption: 'Call 8380017393', icon: Phone, action: () => window.open('tel:8380017393') }];
  return <div className="screen salon-account-screen"><PageHeader title="Salon account" subtitle="Your business, in one place." action={<button className="refresh-text-button" onClick={load}><Zap size={15} /> Refresh</button>} /><section className="salon-profile-hero"><div className="salon-profile-photo"><ImageWithFallback src={profile.imageUrl || profile.imagesArray?.[0]} fallback="/assets/my_naai.png" alt={profile.salonName || 'Salon'} /></div><div className="salon-profile-copy"><span className="eyebrow">SALON PARTNER</span><h2>{profile.salonName || 'Your salon'}</h2><p><MapPin size={14} /> {profile.addressLine1 || profile.city || 'Add your salon address'}</p><span className={cx('account-status', status.isOpen ? 'open' : 'closed')}><i /> {status.isOpen ? 'Open for bookings' : 'Closed for bookings'}</span></div><Button size="small" variant="secondary" onClick={() => navigate('editProfile', { profileData: profile })}><Pencil size={15} /> Edit</Button></section><div className="salon-live-status"><div><span className="eyebrow">BOOKING STATUS</span><strong>{status.isOpen ? 'Customers can book you now' : 'Your salon is currently closed'}</strong><small>Toggle this when you are ready to take the next appointment.</small></div><Toggle checked={isOpen} onChange={toggleOpen} label={isOpen ? 'Open' : 'Closed'} /></div><div className="salon-profile-stats"><div><strong>{profile.services?.length || 0}</strong><span>Services</span></div><div><strong>{profile.barbers?.length || 0}</strong><span>Specialists</span></div><div><strong>{Number(profile.ratingAverage || 0).toFixed(1)}</strong><span>Rating</span></div></div><div className="account-card partner-menu">{menus.map(item => <button className="account-menu-row" key={item.label} onClick={item.action || (() => navigate(item.route, item.route === 'editProfile' ? { profileData: profile } : {}))}><span className="account-menu-icon"><item.icon size={18} /></span><span><strong>{item.label}</strong><small>{item.caption}</small></span><ChevronRight size={17} /></button>)}</div><p className="version-label">MyNaai partner portal · 1.0</p></div>;
}

function getEditorBusinessHour(value = {}) {
  return Array.isArray(value) ? value[0] || {} : value || {};
}

function hasCoordinate(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

function editorTime(value, fallback) {
  const text = String(value || fallback).slice(0, 5);
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

function apiTime(value) {
  return `${String(value || '09:00').slice(0, 5)}:00`;
}

function isNewEditorRecord(id) {
  const value = String(id || '');
  return !value || value.startsWith('new-') || value.startsWith('existing-');
}

export function EditSalonProfileScreen({ params, session, navigate, notify, onSessionUpdate }) {
  const routeProfile = params?.profileData && typeof params.profileData === 'object' ? params.profileData : null;
  const initial = routeProfile || (session.demo ? DEMO_SALON_PROFILE : { ...(session.user || {}), ...(session.user?.salon || {}) });
  const isOnboarding = params?.isOnboarding === true || params?.isOnboarding === 'true' || session.isNewSalon;
  const salonId = session.userId || initial.salonId || initial.salon?.salonId || '';
  const [profile, setProfile] = useState(initial);
  const [salonName, setSalonName] = useState(initial.salonName || '');
  const [ownerName, setOwnerName] = useState(initial.ownerName || '');
  const [phoneNumber, setPhoneNumber] = useState(initial.phoneNumber || '');
  const [email, setEmail] = useState(initial.email || '');
  const [addressLine1, setAddressLine1] = useState(initial.addressLine1 || initial.address || '');
  const [addressLine2, setAddressLine2] = useState(initial.addressLine2 || '');
  const [city, setCity] = useState(initial.city || '');
  const [state, setState] = useState(initial.state || '');
  const [pincode, setPincode] = useState(initial.pincode === undefined || initial.pincode === null ? '' : String(initial.pincode));
  const [genderType, setGenderType] = useState(String(initial.genderType || '').toUpperCase());
  const [agentCode, setAgentCode] = useState(initial.agentCode || '');
  const [latitude, setLatitude] = useState(hasCoordinate(initial.latitude) ? Number(initial.latitude) : null);
  const [longitude, setLongitude] = useState(hasCoordinate(initial.longitude) ? Number(initial.longitude) : null);
  const initialHour = getEditorBusinessHour(initial.businessHours);
  const [openTime, setOpenTime] = useState(editorTime(initialHour.openingTime, '09:00'));
  const [closeTime, setCloseTime] = useState(editorTime(initialHour.closingTime, '21:00'));
  const initialHoliday = initialHour.holidayDays?.[0];
  const [holiday, setHoliday] = useState(initialHoliday === undefined || initialHoliday === null || initialHoliday === '' ? '' : String(initialHoliday));
  const [images, setImages] = useState((initial.imagesArray || (initial.imageUrl ? [initial.imageUrl] : [])).filter(Boolean).slice(0, 4));
  const [services, setServices] = useState((initial.services || []).map(normalizeService));
  const [barbers, setBarbers] = useState((initial.barbers || []).map(normalizeBarber));
  const [isActive, setIsActive] = useState(initial.isActive !== false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!session.demo && !routeProfile);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  const populate = useCallback(data => {
    const next = data || {};
    const businessHour = getEditorBusinessHour(next.businessHours);
    setProfile(next);
    setSalonName(next.salonName || '');
    setOwnerName(next.ownerName || '');
    setPhoneNumber(next.phoneNumber || '');
    setEmail(next.email || '');
    setAddressLine1(next.addressLine1 || next.address || '');
    setAddressLine2(next.addressLine2 || '');
    setCity(next.city || '');
    setState(next.state || '');
    setPincode(next.pincode === undefined || next.pincode === null ? '' : String(next.pincode));
    setGenderType(String(next.genderType || '').toUpperCase());
    setAgentCode(next.agentCode || '');
    setLatitude(hasCoordinate(next.latitude) ? Number(next.latitude) : null);
    setLongitude(hasCoordinate(next.longitude) ? Number(next.longitude) : null);
    setOpenTime(editorTime(businessHour.openingTime, '09:00'));
    setCloseTime(editorTime(businessHour.closingTime, '21:00'));
    const nextHoliday = businessHour.holidayDays?.[0];
    setHoliday(nextHoliday === undefined || nextHoliday === null || nextHoliday === '' ? '' : String(nextHoliday));
    setImages((next.imagesArray || (next.imageUrl ? [next.imageUrl] : [])).filter(Boolean).slice(0, 4));
    setServices((next.services || []).map(normalizeService));
    setBarbers((next.barbers || []).map(normalizeBarber));
    setIsActive(next.isActive !== false);
  }, []);

  useEffect(() => {
    if (session.demo || routeProfile) return undefined;
    let active = true;
    setLoading(true);
    api.salonProfile({ salonId }).then(response => {
      if (!active) return;
      if (response?.status !== 'SUCCESS') throw new Error(response?.message || 'Unable to load profile.');
      populate(response.data);
    }).catch(error => {
      if (active) notify?.('error', getErrorMessage(error, 'Unable to load profile.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [notify, populate, routeProfile, salonId, session.demo]);

  const detectLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError('');
    try {
      const current = await getBrowserLocation();
      if (!current || !hasCoordinate(current.latitude) || !hasCoordinate(current.longitude)) {
        setLocationError('Location permission is unavailable. Allow location for this site, then try again.');
        return;
      }
      setLatitude(Number(current.latitude));
      setLongitude(Number(current.longitude));
      setLocationError('');
    } catch (error) {
      setLocationError(getErrorMessage(error, 'Unable to detect the current salon location.'));
    } finally {
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session.demo && !loading && (!hasCoordinate(latitude) || !hasCoordinate(longitude))) detectLocation();
  }, [detectLocation, latitude, loading, longitude, session.demo]);

  const addImages = event => {
    const files = Array.from(event.target.files || []).slice(0, Math.max(0, 4 - images.length));
    setImages(current => [...current, ...files.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
    event.target.value = '';
  };
  const removeImage = index => setImages(current => current.filter((_, itemIndex) => itemIndex !== index));
  const updateService = (id, key, value) => setServices(current => current.map(item => item.id === id ? { ...item, [key]: value } : item));
  const updateBarber = (id, key, value) => setBarbers(current => current.map(item => item.id === id ? { ...item, [key]: value } : item));
  const addService = () => setServices(current => [...current, normalizeService({ id: `new-service-${Date.now()}` }, current.length)]);
  const addBarber = () => setBarbers(current => [...current, normalizeBarber({ id: `new-barber-${Date.now()}` }, current.length)]);
  const loadDefaultServices = () => {
    const defaults = DEFAULT_SERVICES[String(genderType || '').toLowerCase()] || [];
    if (!defaults.length) return notify?.('error', 'Choose a salon type before loading default services.');
    setServices(defaults.map((item, index) => ({ ...normalizeService(item, index), id: `new-service-${Date.now()}-${index}` })));
  };
  const removeService = async id => {
    if (isNewEditorRecord(id) || session.demo) return setServices(current => current.filter(item => item.id !== id));
    if (!window.confirm('Delete this service?')) return;
    try {
      const response = await api.deleteSalonService(id);
      if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Could not delete service.');
      setServices(current => current.filter(item => item.id !== id));
      notify?.('success', 'Service deleted.');
    } catch (error) { notify?.('error', getErrorMessage(error, 'Could not delete service.')); }
  };
  const removeBarber = async id => {
    if (isNewEditorRecord(id) || session.demo) return setBarbers(current => current.filter(item => item.id !== id));
    if (!window.confirm('Delete this specialist?')) return;
    try {
      const response = await api.deleteSalonBarber(id);
      if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Could not delete specialist.');
      setBarbers(current => current.filter(item => item.id !== id));
      notify?.('success', 'Specialist deleted.');
    } catch (error) { notify?.('error', getErrorMessage(error, 'Could not delete specialist.')); }
  };

  const uploadImage = async image => {
    if (!image?.file) return typeof image === 'string' ? image : '';
    const response = await api.uploadImage(image.file);
    return response?.url || response?.data?.url || response?.path || response?.data?.path || '';
  };

  const validate = () => {
    if (!salonId) return 'Salon ID is unavailable. Please sign in again.';
    if (!ownerName.trim()) return 'Please enter the salon owner name.';
    if (!salonName.trim()) return 'Please enter the salon name.';
    if (phoneNumber.replace(/\D/g, '').length !== 10) return 'Please enter a valid 10-digit mobile number.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Please enter a valid email address.';
    if (!genderType) return 'Please select the salon type.';
    if (!addressLine1.trim()) return 'Please enter the salon address.';
    if (agentCode.trim() && !/^\d{10}$/.test(agentCode.trim())) return 'Agent code must be exactly 10 digits or blank.';
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) return 'Pincode must contain 6 digits.';
    if (!hasCoordinate(latitude) || !hasCoordinate(longitude) || Number(latitude) < -90 || Number(latitude) > 90 || Number(longitude) < -180 || Number(longitude) > 180) return 'Detect and save the salon location before continuing.';
    if (openTime === closeTime) return 'Opening and closing time cannot be the same.';
    if (!services.length) return 'Please add at least one salon service.';
    if (services.some(item => !item.name.trim() || item.price === '' || Number(item.price) < 0 || !item.duration || Number(item.duration) <= 0)) return 'Enter a valid service name, price and duration for every service.';
    if (barbers.some(item => !item.name.trim())) return 'Please enter the name of every specialist.';
    return '';
  };

  const save = async event => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) return notify?.('error', validationError);
    setSaving(true);
    try {
      const uploadedImages = [];
      for (const image of images) {
        const path = await uploadImage(image);
        if (path) uploadedImages.push(path);
      }
      const existingServices = services.filter(item => !isNewEditorRecord(item.id)).map(item => ({
        serviceId: item.serviceId || item.id,
        serviceName: item.name.trim(),
        durationMinutes: Number(item.duration) || 60,
        price: String(item.price || 0),
        description: item.description?.trim() || 'Salon service',
      }));
      const newServices = services.filter(item => isNewEditorRecord(item.id)).map(item => ({
        serviceName: item.name.trim(),
        durationMinutes: Number(item.duration) || 60,
        price: String(item.price || 0),
        description: item.description?.trim() || 'Salon service',
      }));
      const existingBarbers = barbers.filter(item => !isNewEditorRecord(item.id)).map(item => ({
        barberId: item.barberId || item.id,
        fullName: item.name.trim(),
        profileImageUrl: item.image || null,
        ratingAverage: String(item.rating || '0.0'),
        isAvailable: item.isAvailable !== false,
      }));
      const newBarbers = barbers.filter(item => isNewEditorRecord(item.id)).map(item => ({
        fullName: item.name.trim(),
        profileImageUrl: item.image || null,
        ratingAverage: String(item.rating || '0.0'),
        isAvailable: item.isAvailable !== false,
      }));
      const existingBusinessHour = getEditorBusinessHour(profile.businessHours);
      const businessHour = {
        openingTime: apiTime(openTime),
        closingTime: apiTime(closeTime),
        breakStartTime: existingBusinessHour.breakStartTime || null,
        breakEndTime: existingBusinessHour.breakEndTime || null,
        holidayDays: holiday === '' ? [] : [Number.isFinite(Number(holiday)) ? Number(holiday) : holiday],
      };
      if (existingBusinessHour.scheduleId) businessHour.scheduleId = existingBusinessHour.scheduleId;
      const payload = {
        salonId,
        ownerName: ownerName.trim(),
        salonName: salonName.trim(),
        phoneNumber: phoneNumber.replace(/\D/g, ''),
        email: email.trim() || null,
        genderType,
        agentCode: agentCode.trim() || null,
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || null,
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        imageUrl: uploadedImages[0] || null,
        imagesArray: uploadedImages,
        existingServices,
        newServices,
        existingBarbers,
        newBarbers,
        businessHours: [businessHour],
        isActive,
        profileCompleted: true,
      };
      if (!session.demo) {
        const response = await api.updateSalonProfile(payload);
        if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Could not update profile.');
      }
      const next = { ...profile, ...payload, services: [...existingServices, ...newServices], barbers: [...existingBarbers, ...newBarbers] };
      setProfile(next);
      localStorage.setItem('profileCompleted', 'true');
      if (isOnboarding) localStorage.setItem('isNewSalon', 'false');
      onSessionUpdate?.(next, isOnboarding ? { isNewSalon: false } : undefined);
      notify?.('success', 'Salon profile saved.');
      if (isOnboarding) navigate('account', {}, { replace: true }); else navigate(-1);
    } catch (error) {
      notify?.('error', getErrorMessage(error, 'Could not save salon profile.'));
    } finally { setSaving(false); }
  };

  if (loading) return <div className="screen"><PageHeader title="Edit salon profile" /><div className="account-loading"><Spinner label="Loading profile…" /></div></div>;
  const hasLocation = hasCoordinate(latitude) && hasCoordinate(longitude);
  return <div className="screen edit-salon-screen"><PageHeader title={isOnboarding ? 'Complete salon profile' : 'Edit salon profile'} subtitle={isOnboarding ? 'Add the details customers need before you open your dashboard.' : 'Give customers a clear picture of your business.'} onBack={isOnboarding ? undefined : () => navigate(-1)} /><form className="profile-editor" onSubmit={save}>
    <section className="editor-section"><div className="editor-section-heading"><div><span className="eyebrow">01 · BASICS</span><h2>Salon details</h2><p>These details are shown to customers and used for booking.</p></div><Store size={20} /></div><div className="form-two-col"><Field label="Salon name"><input value={salonName} onChange={event => setSalonName(event.target.value)} placeholder="Your salon name" /></Field><Field label="Owner name"><input value={ownerName} onChange={event => setOwnerName(event.target.value)} placeholder="Owner name" /></Field></div><div className="form-two-col"><Field label="Phone number"><input inputMode="numeric" value={phoneNumber} onChange={event => setPhoneNumber(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" /></Field><Field label="Email" hint="Optional"><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="owner@example.com" /></Field></div><SelectField label="Salon type" value={genderType} onChange={event => setGenderType(event.target.value)} options={[{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'UNISEX', label: 'Unisex' }]} placeholder="Select salon type" /><Field label="Agent code" hint="Optional · exactly 10 digits"><input inputMode="numeric" maxLength="10" value={agentCode} onChange={event => setAgentCode(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Optional agent code" /></Field><div className="switch-form-row"><span><strong>Accept new bookings</strong><small>Keep the salon active in customer discovery.</small></span><Toggle checked={isActive} onChange={setIsActive} /></div></section>
    <section className="editor-section"><div className="editor-section-heading"><div><span className="eyebrow">02 · ADDRESS & LOCATION</span><h2>Where customers can find you</h2><p>Accurate coordinates power nearby salon sorting.</p></div><MapPin size={20} /></div><Field label="Address line 1"><textarea value={addressLine1} onChange={event => setAddressLine1(event.target.value)} placeholder="Street, area, building" rows="3" /></Field><Field label="Address line 2" hint="Optional"><input value={addressLine2} onChange={event => setAddressLine2(event.target.value)} placeholder="Landmark or nearby place" /></Field><div className="form-three-col editor-address-grid"><Field label="City"><input value={city} onChange={event => setCity(event.target.value)} placeholder="City" /></Field><Field label="State"><input value={state} onChange={event => setState(event.target.value)} placeholder="State" /></Field><Field label="Pincode"><input inputMode="numeric" maxLength="6" value={pincode} onChange={event => setPincode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Pincode" /></Field></div><div className={cx('editor-location-status', hasLocation ? 'location-ready' : 'location-missing')}><MapPin size={17} /><span><strong>{hasLocation ? 'Location saved' : 'Location required'}</strong><small>{hasLocation ? `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}` : locationError || 'Allow location access so nearby customers can discover this salon.'}</small></span></div><Button type="button" size="small" variant="secondary" onClick={detectLocation} loading={locationLoading}><MapPin size={15} /> Detect current location</Button></section>
    <section className="editor-section"><div className="editor-section-heading"><div><span className="eyebrow">03 · ATMOSPHERE</span><h2>Salon photos</h2><p>Up to 4 photos · the first becomes your main image.</p></div><ImagePlus size={20} /></div><div className="editor-photo-grid">{images.map((image, index) => <div className="editor-photo" key={`${typeof image === 'string' ? image : image.preview}-${index}`}><ImageWithFallback src={typeof image === 'string' ? image : image.preview} fallback="/assets/my_naai.png" alt="Salon preview" /><button type="button" onClick={() => removeImage(index)} aria-label="Remove photo"><X size={15} /></button></div>)}{images.length < 4 && <label className="add-photo"><Plus size={20} /><span>Add photo</span><input type="file" accept="image/*" multiple onChange={addImages} /></label>}</div></section>
    <section className="editor-section"><div className="editor-section-heading"><div><span className="eyebrow">04 · AVAILABILITY</span><h2>Opening hours</h2><p>Set when customers can request an appointment.</p></div><Clock3 size={20} /></div><div className="form-two-col"><Field label="Opens"><input type="time" value={openTime} onChange={event => setOpenTime(event.target.value)} /></Field><Field label="Closes"><input type="time" value={closeTime} onChange={event => setCloseTime(event.target.value)} /></Field></div><SelectField label="Weekly off" value={holiday} onChange={event => setHoliday(event.target.value)} placeholder="No weekly off" options={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => ({ value: String(index), label: day }))} /></section>
    <section className="editor-section"><div className="editor-section-heading"><div><span className="eyebrow">05 · MENU</span><h2>Services</h2><p>Every service needs a name, price and duration.</p></div><div className="editor-heading-actions"><button type="button" className="add-inline-button" onClick={loadDefaultServices}><RefreshCw size={14} /> Defaults</button><button type="button" className="add-inline-button" onClick={addService}><Plus size={15} /> Add service</button></div></div><div className="editor-items">{services.map(item => <div className="editor-item" key={item.id}><div className="editor-item-title"><Scissors size={15} /><strong>{item.name || 'New service'}</strong><button type="button" onClick={() => removeService(item.id)} aria-label="Delete service"><Trash2 size={15} /></button></div><div className="form-three-col"><input value={item.name} onChange={event => updateService(item.id, 'name', event.target.value)} placeholder="Service name" /><input type="number" min="0" value={item.price} onChange={event => updateService(item.id, 'price', event.target.value)} placeholder="Price" /><input type="number" min="5" value={item.duration} onChange={event => updateService(item.id, 'duration', event.target.value)} placeholder="Minutes" /></div><textarea className="editor-description" value={item.description} onChange={event => updateService(item.id, 'description', event.target.value)} placeholder="Short service description" rows="2" /></div>)}</div>{!services.length && <div className="editor-empty">No services added yet. Load defaults or add one manually.</div>}</section>
    <section className="editor-section"><div className="editor-section-heading"><div><span className="eyebrow">06 · PEOPLE</span><h2>Specialists</h2><p>Add the people customers can choose during booking.</p></div><button type="button" className="add-inline-button" onClick={addBarber}><Plus size={15} /> Add specialist</button></div><div className="editor-items">{barbers.map(item => <div className="editor-item barber-editor-item" key={item.id}><div className="editor-item-title"><div className="mini-avatar">{getInitials(item.name || 'New')}</div><strong>{item.name || 'New specialist'}</strong><button type="button" onClick={() => removeBarber(item.id)} aria-label="Delete specialist"><Trash2 size={15} /></button></div><div className="form-two-col"><input value={item.name} onChange={event => updateBarber(item.id, 'name', event.target.value)} placeholder="Full name" /><input type="number" min="0" max="5" step="0.1" value={item.rating} onChange={event => updateBarber(item.id, 'rating', event.target.value)} placeholder="Rating" /></div><Toggle checked={item.isAvailable} onChange={value => updateBarber(item.id, 'isAvailable', value)} label={item.isAvailable ? 'Available' : 'Away'} /></div>)}</div>{!barbers.length && <div className="editor-empty">No specialists added. Customers can still choose any available chair.</div>}</section>
    <div className="editor-actions"><Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={isOnboarding}>Cancel</Button><Button type="submit" loading={saving}>{isOnboarding ? 'Save and continue' : 'Save profile'} <Check size={17} /></Button></div>
  </form></div>;
}

const PARTNER_PLANS = [{ id: 'trial_2_months', title: 'Introductory', price: 299, duration: '2 months · 60 days', note: 'A gentle start for new partners' }, { id: 'monthly', title: 'Monthly plan', price: 199, duration: 'Per month', note: 'Flexible month-to-month growth' }, { id: 'quarterly', title: 'Quarterly plan', price: 499, duration: '3 months · 90 days', note: 'Best value for busy salons', best: true }];
const RENEWAL_PLANS = [{ id: 'trial_2_months', title: 'Introductory', price: 179, duration: '2 months · 60 days', note: 'Restart with a simple plan' }, { id: 'monthly', title: 'Monthly plan', price: 99, duration: 'Per month', note: 'Flexible month-to-month growth' }, { id: 'quarterly', title: 'Quarterly plan', price: 249, duration: '3 months · 90 days', note: 'Best value for busy salons', best: true }];

export function SubscriptionScreen({ params = {}, session, navigate, notify, onAuthComplete }) {
  const registrationData = params.registrationData;
  const isRegistration = Boolean(registrationData);
  const isUpgrade = Boolean(params.isUpgrade || params.mode === 'RENEW');
  const plans = isUpgrade ? RENEWAL_PLANS : PARTNER_PLANS;
  const [selected, setSelected] = useState(isRegistration ? 'trial_2_months' : '');
  const [loading, setLoading] = useState(false);
  const processPayment = async plan => {
    const paymentKey = import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_live_ST8yVm3RaFMiHW';
    let order;
    try { const response = await api.createPaymentOrder({ amount: plan.price, currency: 'INR' }); order = response?.order; } catch (error) { notify?.('error', getErrorMessage(error, 'Could not create payment order.')); return null; }
    if (!window.Razorpay || !order) { notify?.('error', 'Payment gateway is unavailable. Please try again in a moment.'); return null; }
    return new Promise(resolve => { const razorpay = new window.Razorpay({ key: paymentKey, amount: Number(plan.price) * 100, currency: 'INR', name: 'MyNaai', description: 'Salon partner subscription', order_id: order.id, theme: { color: GOLD }, prefill: { name: registrationData?.ownerName || '', contact: registrationData?.phoneNumber || '' }, handler: payment => resolve({ ...payment, orderId: payment.razorpay_order_id || order.id, paymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature }) }); razorpay.on('payment.failed', () => resolve(null)); razorpay.open(); });
  };
  const continuePlan = async () => {
    const plan = plans.find(item => item.id === selected);
    if (!plan) return notify?.('error', 'Please choose a plan to continue.');
    if (isRegistration && !String(registrationData?.deviceToken || '').trim()) return notify?.('error', 'Browser notifications must be enabled before salon registration can continue.');
    setLoading(true);
    try {
      if (session?.demo && !isRegistration) { notify?.('success', `${plan.title} selected. In live mode this opens Razorpay.`); navigate('account'); return; }
      if (isRegistration) {
        if (registrationData.tempToken) setToken(registrationData.tempToken);
        let payment = { paymentId: 'web_free_trial', orderId: '', signature: '' };
        if (plan.price > 0) { payment = await processPayment(plan); if (!payment) return; }
        const response = await api.createSalon({ ...registrationData, planType: plan.id, paymentId: payment.paymentId, orderId: payment.orderId, signature: payment.signature });
        if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Salon registration failed');
        const createdSalonId = response.salonId || response.data?.salonId;
        const user = { salon: { salonId: createdSalonId }, salonId: createdSalonId, ownerName: registrationData.ownerName, salonName: registrationData.salonName };
        onAuthComplete?.({ role: 'SALON', token: response.token || response.data?.token, user, userId: createdSalonId, isNewSalon: false, demo: false });
        return;
      }
      const payment = await processPayment(plan);
      if (!payment) return;
      const response = await api.renewSalon({ planType: plan.id, paymentId: payment.paymentId, totalAmount: plan.price });
      if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Renewal failed');
      notify?.('success', 'Plan renewed successfully.'); navigate('account');
    } catch (error) { notify?.('error', getErrorMessage(error, 'Payment process failed.')); } finally { setLoading(false); }
  };
  return <div className="screen subscription-screen"><PageHeader title={isUpgrade ? 'Renew your plan' : 'Choose your plan'} subtitle={isUpgrade ? 'Keep your salon visible and ready for bookings.' : 'Start building your salon presence on MyNaai.'} onBack={isRegistration ? params.onBack : () => navigate(-1)} /><div className="subscription-intro"><div className="subscription-mark"><Crown size={21} /></div><div><strong>{isUpgrade ? 'Keep the momentum going' : 'Simple plans for growing salons'}</strong><p>No confusing tiers. Pick what fits your business today.</p></div></div><div className="plan-grid">{plans.map(plan => <button className={cx('plan-card', selected === plan.id && 'active')} key={plan.id} onClick={() => setSelected(plan.id)} disabled={loading}>{plan.best && <span className="plan-best">BEST VALUE</span>}<span className="plan-radio">{selected === plan.id && <Check size={13} />}</span><span className="plan-card-title">{plan.title}</span><strong>{formatCurrency(plan.price)}</strong><span>{plan.duration}</span><small>{plan.note}</small></button>)}</div><div className="plan-benefits"><span><CheckCircle2 size={15} /> Be discoverable nearby</span><span><CheckCircle2 size={15} /> Manage your live queue</span><span><CheckCircle2 size={15} /> Get booking updates</span></div><Button className="subscription-continue" onClick={continuePlan} loading={loading}>{isUpgrade ? 'Renew plan' : 'Continue to payment'} <ArrowRightIcon /></Button>{!isRegistration && <p className="secure-payment"><WalletCards size={14} /> Secure payments powered by Razorpay</p>}</div>;
}

function ArrowRightIcon() { return <ChevronRight size={17} />; }

export function BookingRequestScreen({ params, navigate, notify, session }) {
  const isDemo = session.demo;
  const [details, setDetails] = useState(isDemo ? { customerName: 'Ananya Singh', bookingDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), startTime: '17:00', endTime: '17:45', services: 'Signature Haircut, Beard Sculpt' } : null);
  const [loading, setLoading] = useState(!isDemo);
  const [actionLoading, setActionLoading] = useState('');
  const [delayOpen, setDelayOpen] = useState(params?.openDelayModal === true || params?.openDelayModal === 'true');
  useEffect(() => { if (isDemo || !params?.bookingRequestId) return; api.getBookingRequestById(params.bookingRequestId).then(response => setDetails(response?.data)).catch(error => notify?.('error', getErrorMessage(error, 'Unable to load booking request.'))).finally(() => setLoading(false)); }, [isDemo, notify, params?.bookingRequestId]);
  const action = async (value, delayMinutes) => { setActionLoading(value); try { if (!isDemo) { const response = value === 'DELAY' ? await api.salonDelayBooking(params.bookingRequestId, delayMinutes) : await api.bookingRequestOwnerAction(params.bookingRequestId, { action: value }); if (response?.status && response.status !== 'SUCCESS') throw new Error(response.message || 'Could not update request'); } notify?.('success', value === 'ACCEPT' ? 'Booking accepted.' : value === 'REJECT' ? 'Booking rejected.' : `Customer notified about a ${delayMinutes}-minute delay.`); setDelayOpen(false); navigate('queue'); } catch (error) { notify?.('error', getErrorMessage(error, 'Could not update booking request.')); } finally { setActionLoading(''); } };
  if (loading) return <div className="screen"><PageHeader title="Booking request" onBack={() => navigate(-1)} /><div className="account-loading"><Spinner label="Loading request…" /></div></div>;
  return <div className="screen booking-request-screen"><PageHeader title="New booking request" subtitle="A customer is waiting for your response." onBack={() => navigate('queue')} /><div className="request-card"><div className="request-card-top"><div className="request-avatar">{getInitials(details?.customerName || 'Guest')}</div><div><span className="eyebrow">CUSTOMER</span><h2>{details?.customerName || 'Guest'}</h2><span className="request-status"><i /> Needs your response</span></div></div><div className="request-detail-grid"><div><CalendarDays size={17} /><span><small>Selected date</small><strong>{formatDate(details?.bookingDate)}</strong></span></div><div><Clock3 size={17} /><span><small>Time slot</small><strong>{details?.startTime || '—'} – {details?.endTime || '—'}</strong></span></div><div><Scissors size={17} /><span><small>Services</small><strong>{details?.services || 'Salon service'}</strong></span></div></div></div><div className="request-actions"><div><Button variant="success" loading={actionLoading === 'ACCEPT'} onClick={() => action('ACCEPT')}>Accept <Check size={17} /></Button><Button variant="danger" loading={actionLoading === 'REJECT'} onClick={() => action('REJECT')}>Reject <X size={17} /></Button></div><Button variant="warning" loading={actionLoading === 'DELAY'} onClick={() => setDelayOpen(true)}>Update time <Clock3 size={17} /></Button></div><Modal open={delayOpen} onClose={() => setDelayOpen(false)} title="Update time & notify customer"><p className="modal-lede">If you are running a little late, choose 10 or 20 minutes. MyNaai will send the customer a delay request so they can accept or decline the updated time.</p><div className="delay-options">{[10, 20].map(minutes => <button key={minutes} onClick={() => action('DELAY', minutes)} disabled={Boolean(actionLoading)}><Clock3 size={17} /><span><strong>+{minutes} minutes</strong><small>Send delay request to customer</small></span><ChevronRight size={16} /></button>)}</div></Modal></div>;
}

export const SALON_ABOUT_CONTENT = { title: 'Partner with MyNaai', eyebrow: 'BUILT FOR SALONS', intro: 'MyNaai helps local salons turn spare waiting time into a smoother, more thoughtful customer experience.', sections: [{ title: 'Your chair, your rules', text: 'Keep your services, prices, hours and specialists current so customers know exactly what to expect before they visit.' }, { title: 'A queue that works for you', text: 'See today’s requests, accept the appointments that fit your day and mark each service complete in a couple of taps.' }, { title: 'A better local discovery layer', text: 'Be visible to customers searching nearby and build trust with clear information and reviews.' }] };
export const SALON_FAQ_CONTENT = { title: 'Partner FAQs', eyebrow: 'PARTNER HELP', sections: [{ title: 'How do I update my services?', text: 'Open Salon account, choose Edit salon profile, then update your menu, prices or durations.' }, { title: 'How do I pause bookings?', text: 'Use the booking status switch on your Salon account. Customers will see that your salon is closed.' }, { title: 'Where do new requests appear?', text: 'New requests appear in Customer queue and in Notifications. You can accept, reject or suggest a delay.' }, { title: 'How do I manage products?', text: 'Open Product catalog from the bottom navigation to add, edit, hide or delete products.' }] };
export const SALON_TERMS_CONTENT = { title: 'Partner terms', eyebrow: 'PLEASE READ', intro: 'By listing your salon on MyNaai, you agree to keep business information accurate and treat customers fairly.', sections: [{ title: 'Accurate details', text: 'Keep your salon name, location, hours, service pricing and specialist availability up to date.' }, { title: 'Appointments', text: 'Respond to booking requests promptly and communicate any delay or change through the MyNaai workflow.' }, { title: 'Customer experience', text: 'Customers rely on the details you publish. Please honour confirmed appointments whenever possible.' }] };

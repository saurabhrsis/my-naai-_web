import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CalendarCheck2,
  ChevronRight,
  CircleUserRound,
  Download,
  HelpCircle,
  History,
  Info,
  LogOut,
  MapPin,
  Menu,
  Package,
  Scissors,
  Settings2,
  Sparkles,
  Store,
  UsersRound,
  X,
} from 'lucide-react';
import { api, clearSession, setToken } from './lib/api';
import { deletePushToken, getNotificationRoute, getPushToken, isPushConfigured, setupPush } from './lib/push';
import { DEFAULT_SERVICES, DEMO_SALON_PROFILE, DEMO_USER } from './lib/demoData';
import {
  AccountScreen,
  BookingsScreen,
  DelayRequestScreen,
  HomeScreen,
  InfoScreen,
  NotificationsScreen,
  ProductsScreen,
  SalonDetailScreen,
  ScheduleScreen,
  ServicesScreen,
} from './components/UserScreens';
import {
  BookingRequestScreen,
  EditSalonProfileScreen,
  SALON_ABOUT_CONTENT,
  SALON_FAQ_CONTENT,
  SALON_TERMS_CONTENT,
  SalonAccountScreen,
  SalonHistoryScreen,
  SalonProductsScreen,
  SalonQueueScreen,
  SubscriptionScreen,
} from './components/SalonScreens';
import { Button, Field, getBrowserLocation, getErrorMessage, cx } from './components/Shared';

const USER_NAV = [
  { name: 'home', label: 'Discover', icon: Scissors },
  { name: 'bookings', label: 'My bookings', icon: CalendarCheck2 },
  { name: 'products', label: 'Products', icon: Package },
  { name: 'account', label: 'Account', icon: CircleUserRound },
];
const SALON_NAV = [
  { name: 'queue', label: 'Customer queue', icon: UsersRound },
  { name: 'history', label: 'History', icon: History },
  { name: 'salonProducts', label: 'Products', icon: Package },
  { name: 'account', label: 'Account', icon: CircleUserRound },
];

function readStoredSession() {
  const loggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const role = localStorage.getItem('userType');
  if (!loggedIn || !role) return null;
  let user = {};
  try { user = JSON.parse(localStorage.getItem('mynaaiUser') || '{}'); } catch (parseError) { console.debug(getErrorMessage(parseError, 'Stored session data was invalid.')); user = {}; }
  const userId = user?.userId || user?.salon?.salonId || user?.salonId || user?.id || '';
  const incompleteSalon = String(role).toUpperCase() === 'SALON' && (user?.isNewSalon === true || user?.profileCompleted === false || user?.salon?.profileCompleted === false);
  return { role, user, userId, demo: localStorage.getItem('mynaaiDemo') === 'true', isNewSalon: localStorage.getItem('isNewSalon') === 'true' || incompleteSalon };
}

function saveSession(session) {
  const role = String(session.role || '').toUpperCase();
  const user = session.user || {};
  if (session.token) setToken(session.token);
  localStorage.setItem('mynaaiUser', JSON.stringify(user));
  localStorage.setItem('userType', role);
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('isNewSalon', session.isNewSalon ? 'true' : 'false');
  if (session.demo) localStorage.setItem('mynaaiDemo', 'true'); else localStorage.removeItem('mynaaiDemo');
  return { ...session, role, userId: session.userId || user?.userId || user?.salon?.salonId || user?.salonId || user?.id || '' };
}

const PUSH_REQUIRED_MESSAGE = 'Browser notifications are required to sign in. Add the Firebase Web config and VITE_FIREBASE_VAPID_KEY, allow notifications, then reload the page.';

async function requirePushToken() {
  const token = await getPushToken({ requestPermission: true });
  if (!token) throw new Error(PUSH_REQUIRED_MESSAGE);
  return token;
}

function withDeviceToken(payload, token) {
  const value = typeof token === 'string' ? token.trim() : '';
  return value ? { ...payload, deviceToken: value } : payload;
}

function getRouteFromHash(role) {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const value = path.split('/')[0];
  const needsSalonProfile = String(role).toUpperCase() === 'SALON' && localStorage.getItem('isNewSalon') === 'true';
  const defaultRoute = needsSalonProfile ? 'editProfile' : role === 'SALON' ? 'queue' : 'home';
  if (!value || (needsSalonProfile && value !== 'editProfile')) return { name: defaultRoute, params: needsSalonProfile ? { isOnboarding: 'true' } : {} };
  return { name: value, params: Object.fromEntries(new URLSearchParams(query).entries()) };
}

function NotificationSetupCard({ compact = false, authenticated = false }) {
  const [status, setStatus] = useState('checking');
  const [busy, setBusy] = useState(false);

  const inspect = useCallback(async (requestPermission = false) => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    if (!isPushConfigured()) {
      setStatus('unconfigured');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    try {
      const token = await getPushToken({ requestPermission });
      if (token && token.trim()) {
        setStatus('enabled');
        return;
      }
      setStatus(Notification.permission === 'default' ? 'needs-permission' : 'unavailable');
    } catch (pushError) {
      console.debug(getErrorMessage(pushError, 'Browser notification setup failed.'));
      setStatus(Notification.permission === 'default' ? 'needs-permission' : 'unavailable');
    }
  }, []);

  useEffect(() => { inspect(false); }, [inspect]);

  const enable = async () => {
    setBusy(true);
    try { await inspect(true); } finally { setBusy(false); }
  };

  if (status === 'checking') return null;
  const copy = {
    enabled: { title: 'Notifications enabled', body: authenticated ? 'Booking buzzers and action alerts are ready on this browser.' : 'Allow alerts so MyNaai can keep you updated.' },
    unconfigured: { title: 'Enable browser notifications', body: 'Firebase Web Push is not configured yet. Add the public Firebase and VAPID values before signing in.' },
    unsupported: { title: 'Use a push-capable browser', body: 'This browser cannot receive MyNaai push alerts. Authentication stays protected until a browser token is available.' },
    denied: { title: 'Notifications are blocked', body: 'Open this site’s browser permissions, set Notifications to Allow, then try again. We will not silently discard this state.' },
    'needs-permission': { title: 'Notifications are required', body: 'Allow browser notifications to receive booking buzzers, delay requests and appointment updates.' },
    unavailable: { title: 'Notification token not ready', body: 'We could not generate a browser token. Check Firebase setup and permission, then retry.' },
  }[status];
  const canRetry = !['enabled', 'unconfigured', 'unsupported'].includes(status);
  return (
    <section className={cx('push-setup-card', compact && 'push-setup-compact', status === 'enabled' && 'push-setup-ready')} aria-live="polite">
      <span className="push-setup-icon"><Bell size={compact ? 15 : 18} /></span>
      <div className="push-setup-copy"><strong>{copy.title}</strong><p>{copy.body}</p></div>
      {canRetry && <Button size="small" onClick={enable} loading={busy}>{status === 'denied' ? 'Try again' : 'Enable alerts'}</Button>}
    </section>
  );
}

export default function App() {
  const [session, setSession] = useState(readStoredSession);
  const [route, setRoute] = useState(() => getRouteFromHash(session?.role));
  const [installPrompt, setInstallPrompt] = useState(null);
  useEffect(() => {
    const onBeforeInstall = event => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);
  const completeAuth = useCallback(async nextSession => {
    let resolvedSession = nextSession;
    // Some salon login responses expose isNewSalon while others only expose
    // profileCompleted on the profile endpoint. Check both so an incomplete
    // partner can never briefly land on the normal queue dashboard.
    const role = String(nextSession?.role).toUpperCase();
    const alreadyIncomplete = nextSession?.isNewSalon === true || nextSession?.user?.profileCompleted === false || nextSession?.user?.salon?.profileCompleted === false;
    if (role === 'SALON' && alreadyIncomplete) {
      resolvedSession = { ...nextSession, isNewSalon: true };
    } else if (role === 'SALON' && !nextSession.demo && nextSession.userId) {
      if (nextSession.token) setToken(nextSession.token);
      try {
        const response = await api.salonProfile({ salonId: nextSession.userId });
        const fetchedProfile = response?.data?.salon || response?.data || {};
        if (fetchedProfile.profileCompleted === false || fetchedProfile.isNewSalon === true) {
          resolvedSession = { ...nextSession, isNewSalon: true, user: { ...(nextSession.user || {}), ...fetchedProfile } };
        }
      } catch (profileError) {
        console.debug(getErrorMessage(profileError, 'Could not preflight salon profile completion.'));
      }
    }
    const stored = saveSession(resolvedSession);
    setSession(stored);
    const needsSalonProfile = stored.role === 'SALON' && stored.isNewSalon;
    const nextRoute = needsSalonProfile ? 'editProfile' : stored.role === 'SALON' ? 'queue' : 'home';
    const nextParams = needsSalonProfile ? { isOnboarding: 'true' } : {};
    setRoute({ name: nextRoute, params: nextParams });
    const query = new URLSearchParams(nextParams).toString();
    window.history.replaceState({}, '', `#/${nextRoute}${query ? `?${query}` : ''}`);
  }, []);
  const logout = useCallback(() => { clearSession(); setSession(null); setRoute({ name: 'home', params: {} }); window.history.replaceState({}, '', '#/'); }, []);
  const updateSessionUser = useCallback((user, sessionPatch = {}) => setSession(current => {
    if (!current) return current;
    const nextUser = { ...current.user, ...user };
    localStorage.setItem('mynaaiUser', JSON.stringify(nextUser));
    if (Object.prototype.hasOwnProperty.call(sessionPatch, 'isNewSalon')) {
      localStorage.setItem('isNewSalon', sessionPatch.isNewSalon ? 'true' : 'false');
    }
    return { ...current, ...sessionPatch, user: nextUser };
  }), []);
  useEffect(() => {
    const onRouteChange = () => setRoute(getRouteFromHash(session?.role));
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('hashchange', onRouteChange);
    return () => {
      window.removeEventListener('popstate', onRouteChange);
      window.removeEventListener('hashchange', onRouteChange);
    };
  }, [session?.role]);
  useEffect(() => {
    if (session?.role !== 'SALON' || !session.isNewSalon || route.name === 'editProfile') return;
    const next = { name: 'editProfile', params: { isOnboarding: 'true' } };
    setRoute(next);
    window.history.replaceState({}, '', '#/editProfile?isOnboarding=true');
  }, [route.name, session?.isNewSalon, session?.role]);
  const navigate = useCallback((screen, params = {}, options = {}) => {
    if (screen === -1) { window.history.back(); return; }
    const next = typeof screen === 'object' ? screen : { name: screen, params };
    setRoute(next);
    const serializableParams = Object.fromEntries(Object.entries(next.params || {}).filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object'));
    const query = new URLSearchParams(serializableParams).toString();
    const hash = `#/${next.name}${query ? `?${query}` : ''}`;
    if (options.replace) window.history.replaceState({}, '', hash); else window.history.pushState({}, '', hash);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  useEffect(() => {
    const onStorage = event => {
      if (['mynaai', 'mynaaiUser', 'userType', 'isLoggedIn', 'isNewSalon', 'mynaaiDemo'].includes(event.key)) {
        const next = readStoredSession();
        setSession(next);
        if (next) setRoute(getRouteFromHash(next.role));
      }
    };
    const onSessionExpired = () => { deletePushToken().catch(error => console.debug(getErrorMessage(error, 'Could not clear the browser notification token.'))); setSession(null); setRoute({ name: 'home', params: {} }); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('mynaai:session-expired', onSessionExpired);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('mynaai:session-expired', onSessionExpired);
    };
  }, []);
  useEffect(() => {
    if (!session || session.demo) return undefined;
    let cancelled = false;
    let unsubscribe = () => {};
    setupPush({
      onMessage: payload => {
        if (cancelled) return;
        const next = getNotificationRoute(payload?.data || payload || {}, session.role);
        setRoute(next);
        window.history.pushState({}, '', `#/${next.name}${new URLSearchParams(next.params).toString() ? `?${new URLSearchParams(next.params).toString()}` : ''}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    }).then(result => {
      if (cancelled) result?.unsubscribe?.();
      else unsubscribe = result?.unsubscribe || (() => {});
    }).catch(pushError => {
      if (!cancelled) console.debug(getErrorMessage(pushError, 'Live browser notifications are unavailable.'));
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [session?.demo, session?.role, session?.userId]);
  const install = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); };
  if (!session) return <AuthFlow onComplete={completeAuth} />;
  return <AppShell session={session} route={route} navigate={navigate} onLogout={logout} onSessionUpdate={updateSessionUser} notifyInstall={installPrompt ? install : null} />;
}

function AuthFlow({ onComplete }) {
  const [view, setView] = useState(() => localStorage.getItem('hasSeenOnboarding') === 'true' ? 'login' : 'onboarding');
  const [slide, setSlide] = useState(0);
  const [role, setRole] = useState('USER');
  const [step, setStep] = useState('phone');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [pushToken, setPushToken] = useState('');
  const [userExists, setUserExists] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onboarding = [{ image: '/assets/naai/naai3.jpg', kicker: 'THE PROFESSIONAL SPECIALISTS', title: 'Your next good look is closer than you think.', text: 'Find trusted barbers and salons around your location.' }, { image: '/assets/naai/naai2.jpeg', kicker: 'A LITTLE MORE YOU', title: 'Book the service. Skip the waiting room.', text: 'Haircut, beard, spa and more — choose a time that works for you.' }, { image: '/assets/naai/naai1.jpg', kicker: 'MADE FOR YOUR TIME', title: 'Good style, without the guesswork.', text: 'See availability, pick your specialist and arrive ready.' }];
  const finishOnboarding = () => { localStorage.setItem('hasSeenOnboarding', 'true'); setView('login'); };
  const demo = demoRole => { const isSalon = demoRole === 'SALON'; onComplete({ role: demoRole, user: isSalon ? { salon: { salonId: DEMO_SALON_PROFILE.salonId }, ...DEMO_SALON_PROFILE } : DEMO_USER, userId: isSalon ? DEMO_SALON_PROFILE.salonId : DEMO_USER.userId, demo: true, isNewSalon: false }); };
  const requestOtp = async event => {
    event.preventDefault();
    if (!/^\d{10}$/.test(mobile)) return setError('Enter a valid 10-digit mobile number.');
    setBusy(true); setError('');
    try { const token = await requirePushToken(); setPushToken(token); const response = role === 'USER' ? await api.userLogin({ phoneNumber: mobile }) : await api.SalonLogin({ phoneNumber: mobile }); if (response?.status !== 'SUCCESS') throw new Error(response?.message || 'Could not send OTP.'); setStep('otp'); setOtp(''); } catch (requestError) { setError(getErrorMessage(requestError, 'Could not send OTP. Please try again.')); } finally { setBusy(false); }
  };
  const verify = async event => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit OTP.');
    setBusy(true); setError('');
    try {
      const deviceToken = pushToken || await requirePushToken();
      const payload = withDeviceToken({ phoneNumber: mobile, otp }, deviceToken);
      const response = role === 'USER' ? await api.verifyLogin(payload) : await api.verifySalonLogin(payload);
      if (response?.status !== 'SUCCESS') throw new Error(response?.message || 'OTP verification failed.');
      if (role === 'USER' && response.isUserExist === false && !response?.data?.token) { setUserExists(false); setStep('new-user'); return; }
      const user = response.data || {};
      const isNewSalon = role === 'SALON' && Boolean(response.isNewSalon || user.isNewSalon || user.profileCompleted === false || user.salon?.profileCompleted === false);
      onComplete({ role, token: user.token, user, userId: user.userId || user.salon?.salonId || user.salonId, isNewSalon, demo: false });
    } catch (verifyError) { setError(getErrorMessage(verifyError, 'That code did not work. Please try again.')); } finally { setBusy(false); }
  };
  const createAccount = async event => {
    event.preventDefault();
    if (!name.trim()) return setError('Tell us your name to finish setting up.');
    setBusy(true); setError('');
    try { const deviceToken = pushToken || await requirePushToken(); const response = await api.userOnBoard(withDeviceToken({ phoneNumber: mobile, fullName: name.trim() }, deviceToken)); if (response?.status !== 'SUCCESS') throw new Error(response?.message || 'Could not create account.'); onComplete({ role: 'USER', token: response.data?.token, user: response.data, userId: response.data?.userId, demo: false }); } catch (createError) { setError(getErrorMessage(createError, 'Could not create your account.')); } finally { setBusy(false); }
  };
  if (view === 'onboarding') return <div className="auth-page onboarding-page"><div className="onboarding-slide" style={{ backgroundImage: `url(${onboarding[slide].image})` }}><div className="auth-image-shade" /><div className="onboarding-top"><Brand light /><button className="skip-button" onClick={finishOnboarding}>Skip</button></div><div className="onboarding-copy"><span className="eyebrow">{onboarding[slide].kicker}</span><h1>{onboarding[slide].title}</h1><p>{onboarding[slide].text}</p><NotificationSetupCard compact /><div className="onboarding-controls"><div className="onboarding-dots">{onboarding.map((item, index) => <button key={item.kicker} className={index === slide ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`Slide ${index + 1}`} />)}</div><button className="next-circle" onClick={() => slide === onboarding.length - 1 ? finishOnboarding() : setSlide(current => current + 1)} aria-label={slide === onboarding.length - 1 ? 'Get started' : 'Next'}>{slide === onboarding.length - 1 ? <Sparkles size={21} /> : <ChevronRight size={22} />}</button></div></div></div></div>;
  if (view === 'register') return <SalonRegistration onBack={() => setView('login')} onComplete={onComplete} demo={() => demo('SALON')} />;
  return <div className="auth-page login-page"><div className="auth-visual"><div className="auth-visual-image" /><div className="auth-image-shade" /><div className="auth-visual-content"><Brand light /><div><span className="eyebrow">SALON & GROOMING, REIMAGINED</span><h1>Less waiting.<br /><em>More you.</em></h1><p>Book a great salon nearby and make the time yours.</p></div><div className="visual-quote"><span>“</span><p>Your time is valuable. We’re here to give it back.</p></div></div></div><div className="auth-form-panel"><div className="mobile-auth-brand"><Brand /></div><div className="auth-form-wrap"><span className="eyebrow">WELCOME TO MYNAAI</span><h1>{step === 'phone' ? role === 'USER' ? 'Ready when you are.' : 'Welcome, salon partner.' : step === 'new-user' ? 'One last thing.' : 'Check your phone.'}</h1><p className="auth-subtitle">{step === 'phone' ? role === 'USER' ? 'Find your next appointment without the wait.' : 'Manage your queue and grow your local business.' : step === 'new-user' ? `Let’s create your MyNaai profile for +91 ${mobile}.` : `Enter the 6-digit code sent to +91 ${mobile}.`}</p>{step === 'phone' && <NotificationSetupCard />}{step === 'phone' && <div className="role-switch"><button className={role === 'USER' ? 'active' : ''} onClick={() => { setRole('USER'); setError(''); }}><CircleUserRound size={16} /> Customer</button><button className={role === 'SALON' ? 'active' : ''} onClick={() => { setRole('SALON'); setError(''); }}><Store size={16} /> Salon partner</button></div>}{error && <div className="form-error" role="alert"><Info size={16} />{error}</div>}{step === 'phone' && <form onSubmit={requestOtp}><Field label="Mobile number"><div className="phone-input"><span>+91</span><input inputMode="numeric" autoComplete="tel" maxLength="10" value={mobile} onChange={event => setMobile(event.target.value.replace(/\D/g, ''))} placeholder="Enter 10-digit number" autoFocus /></div></Field><Button type="submit" loading={busy}>Continue with OTP <ChevronRight size={17} /></Button></form>}{step === 'otp' && <form onSubmit={verify}><Field label="One-time password"><input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="· · · · · ·" autoFocus /></Field><Button type="submit" loading={busy}>Verify code <ChevronRight size={17} /></Button><button className="resend-link" type="button" onClick={requestOtp}>Resend code</button><button className="back-form-link" type="button" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>Use a different number</button></form>}{step === 'new-user' && <form onSubmit={createAccount}><Field label="Your name"><input value={name} onChange={event => setName(event.target.value)} placeholder="How should we call you?" autoFocus /></Field><Button type="submit" loading={busy}>Create my account <ChevronRight size={17} /></Button></form>}<div className="auth-divider"><span>or</span></div><button className="demo-button" onClick={() => demo(role)}><ZapIcon /> Preview {role === 'USER' ? 'customer' : 'salon'} workspace</button>{step === 'phone' && <>{role === 'USER' ? <button className="partner-link" onClick={() => { setView('register'); setError(''); }}>Are you a salon owner? <strong>Register your salon</strong></button> : <button className="partner-link" onClick={() => { setRole('USER'); setView('login'); }}>Looking for a salon? <strong>Continue as customer</strong></button>}</>}</div><p className="auth-legal">By continuing, you agree to MyNaai’s terms and privacy policy.</p></div></div>;
}

function SalonRegistration({ onBack, onComplete, demo }) {
  const [step, setStep] = useState('phone');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [profile, setProfile] = useState({ ownerName: '', salonName: '', addressLine1: '', addressLine2: '', city: 'Nagpur', state: 'Maharashtra', pincode: '', email: '' });
  const [business, setBusiness] = useState({ genderType: 'UNISEX', openingTime: '09:00', closingTime: '21:00', agentCode: '' });
  const [pushToken, setPushToken] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const detectLocation = useCallback(async () => {
    setLocationBusy(true);
    setLocationError('');
    try {
      const current = await getBrowserLocation();
      if (!current) {
        setLocationError('Allow location for this site so customers can find your salon nearby.');
        return null;
      }
      setLatitude(Number(current.latitude));
      setLongitude(Number(current.longitude));
      return current;
    } catch (locationRequestError) {
      setLocationError(getErrorMessage(locationRequestError, 'Unable to detect your salon location.'));
      return null;
    } finally { setLocationBusy(false); }
  }, []);
  useEffect(() => {
    if (step === 'profile' && latitude === null && longitude === null) detectLocation();
  }, [detectLocation, latitude, longitude, step]);
  const request = async event => { event.preventDefault(); if (!/^\d{10}$/.test(mobile)) return setError('Enter a valid 10-digit mobile number.'); setBusy(true); setError(''); try { const token = await requirePushToken(); setPushToken(token); const response = await api.salonOwnerLogin({ phoneNumber: mobile }); if (response?.status !== 'SUCCESS') throw new Error(response?.message || 'Could not send OTP.'); setStep('otp'); } catch (requestError) { setError(getErrorMessage(requestError, 'Could not send OTP.')); } finally { setBusy(false); } };
  const verify = async event => { event.preventDefault(); if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit OTP.'); setBusy(true); setError(''); try { const deviceToken = pushToken || await requirePushToken(); setPushToken(deviceToken); const response = await api.verifySalonOwnerLogin({ phoneNumber: mobile, otp, deviceToken }); if (response?.status !== 'SUCCESS') throw new Error(response?.message || 'OTP verification failed.'); setTempToken(response.data?.token || ''); setStep('profile'); } catch (verifyError) { setError(getErrorMessage(verifyError, 'That code did not work.')); } finally { setBusy(false); } };
  const continueProfile = event => { event.preventDefault(); if (!profile.ownerName.trim() || !profile.salonName.trim() || !profile.addressLine1.trim()) return setError('Please complete your name, salon name and address.'); setError(''); setStep('business'); };
  const continueBusiness = async event => {
    event.preventDefault();
    if (!business.genderType) return setError('Choose a salon type.');
    if (business.openingTime === business.closingTime) return setError('Opening and closing time cannot be the same.');
    setError(''); setBusy(true);
    try {
      const currentLocation = latitude !== null && longitude !== null ? { latitude, longitude } : await detectLocation();
      if (!currentLocation) throw new Error('Detect your salon location before continuing.');
      setPushToken(await requirePushToken());
      setStep('plans');
    } catch (businessError) { setError(getErrorMessage(businessError, PUSH_REQUIRED_MESSAGE)); }
    finally { setBusy(false); }
  };
  if (step === 'plans') return <SubscriptionScreen params={{ registrationData: { ...profile, phoneNumber: mobile, tempToken, genderType: business.genderType, agentCode: business.agentCode, deviceToken: pushToken, latitude: Number(latitude), longitude: Number(longitude), businessHours: { openingTime: `${business.openingTime}:00`, closingTime: `${business.closingTime}:00`, breakStartTime: null, breakEndTime: null }, services: DEFAULT_SERVICES[business.genderType.toLowerCase()] || [] }, onBack }} session={null} notify={(type, message) => setError(message)} onAuthComplete={onComplete} />;
  const titles = { phone: 'Register your salon.', otp: 'Verify your number.', profile: 'Tell us about you.', business: 'Set up your day.' };
  return <div className="auth-page registration-page"><div className="registration-back"><button className="icon-btn ghost" onClick={step === 'phone' ? onBack : () => setStep(step === 'otp' ? 'phone' : step === 'profile' ? 'otp' : 'profile')} aria-label="Go back"><ChevronRight size={19} className="rotate-180" /></button><Brand /></div><div className="registration-card"><div className="registration-progress"><span className="active" /><span className={step !== 'phone' ? 'active' : ''} /><span className={['business', 'plans'].includes(step) ? 'active' : ''} /><span className={step === 'plans' ? 'active' : ''} /></div><span className="eyebrow">SALON PARTNER · STEP {step === 'phone' ? '1' : step === 'otp' ? '1' : step === 'profile' ? '2' : '3'} OF 3</span><h1>{titles[step]}</h1><p className="auth-subtitle">{step === 'phone' ? 'Join a local network of customers who value their time.' : step === 'otp' ? `Code sent to +91 ${mobile}.` : step === 'profile' ? 'A few details help customers find you.' : 'Tell us when you are ready for your next customer.'}</p><NotificationSetupCard compact />{error && <div className="form-error"><Info size={16} />{error}</div>}{step === 'phone' && <form onSubmit={request}><Field label="Mobile number"><div className="phone-input"><span>+91</span><input inputMode="numeric" maxLength="10" value={mobile} onChange={event => setMobile(event.target.value.replace(/\D/g, ''))} placeholder="Enter 10-digit number" autoFocus /></div></Field><Button type="submit" loading={busy}>Send OTP <ChevronRight size={17} /></Button></form>}{step === 'otp' && <form onSubmit={verify}><Field label="One-time password"><input className="otp-input" inputMode="numeric" maxLength="6" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="· · · · · ·" autoFocus /></Field><Button type="submit" loading={busy}>Verify code <ChevronRight size={17} /></Button></form>}{step === 'profile' && <form onSubmit={continueProfile}><Field label="Owner name"><input value={profile.ownerName} onChange={event => setProfile(current => ({ ...current, ownerName: event.target.value }))} placeholder="Your full name" autoFocus /></Field><Field label="Salon name"><input value={profile.salonName} onChange={event => setProfile(current => ({ ...current, salonName: event.target.value }))} placeholder="What is your salon called?" /></Field><Field label="Address line 1"><textarea rows="3" value={profile.addressLine1} onChange={event => setProfile(current => ({ ...current, addressLine1: event.target.value }))} placeholder="Area, street, city" /></Field><Field label="Address line 2" hint="Optional"><input value={profile.addressLine2} onChange={event => setProfile(current => ({ ...current, addressLine2: event.target.value }))} placeholder="Landmark" /></Field><div className="form-two-col"><Field label="City"><input value={profile.city} onChange={event => setProfile(current => ({ ...current, city: event.target.value }))} placeholder="City" /></Field><Field label="State"><input value={profile.state} onChange={event => setProfile(current => ({ ...current, state: event.target.value }))} placeholder="State" /></Field></div><div className="form-two-col"><Field label="Pincode" hint="Optional"><input inputMode="numeric" maxLength="6" value={profile.pincode} onChange={event => setProfile(current => ({ ...current, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="Pincode" /></Field><Field label="Email" hint="Optional"><input type="email" value={profile.email} onChange={event => setProfile(current => ({ ...current, email: event.target.value }))} placeholder="owner@example.com" /></Field></div><div className={cx('registration-location', latitude !== null && longitude !== null && 'ready')}><MapPin size={15} /><span>{latitude !== null && longitude !== null ? `Location ready · ${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)}` : locationError || 'Detecting salon location…'}</span><button type="button" onClick={detectLocation} disabled={locationBusy}>{locationBusy ? 'Detecting…' : 'Retry'}</button></div><Button type="submit">Next <ChevronRight size={17} /></Button></form>}{step === 'business' && <form onSubmit={continueBusiness}><label className="field"><span className="field-label">Salon type</span><div className="type-option-grid">{['MALE', 'FEMALE', 'UNISEX'].map(type => <button type="button" key={type} className={business.genderType === type ? 'active' : ''} onClick={() => setBusiness(current => ({ ...current, genderType: type }))}>{type === 'UNISEX' ? 'Unisex' : `${type.charAt(0)}${type.slice(1).toLowerCase()}`}</button>)}</div></label><div className="form-two-col"><Field label="Opens"><input type="time" value={business.openingTime} onChange={event => setBusiness(current => ({ ...current, openingTime: event.target.value }))} /></Field><Field label="Closes"><input type="time" value={business.closingTime} onChange={event => setBusiness(current => ({ ...current, closingTime: event.target.value }))} /></Field></div><Field label="Agent code" hint="Optional"><input inputMode="numeric" maxLength="10" value={business.agentCode} onChange={event => setBusiness(current => ({ ...current, agentCode: event.target.value.replace(/\D/g, '') }))} placeholder="Optional agent code" /></Field><Button type="submit">Choose a plan <ChevronRight size={17} /></Button></form>}</div></div>;
}

function Brand({ light = false }) { return <div className={cx('brand', light && 'brand-light')}><div className="brand-symbol"><Scissors size={17} /></div><span>my<span>naai</span></span></div>; }
function ZapIcon() { return <Sparkles size={16} />; }

function AppShell({ session, route, navigate, onLogout, onSessionUpdate, notifyInstall }) {
  const isSalon = session.role === 'SALON';
  const nav = isSalon ? SALON_NAV : USER_NAV;
  const primaryRoutes = nav.map(item => item.name);
  const utilityRoutes = ['detail', 'services', 'schedule', 'notifications', 'delay', 'about', 'faq', 'terms', 'salonAbout', 'salonFaq', 'salonTerms', 'subscription', 'editProfile', 'bookingRequest'];
  const showBottomNav = primaryRoutes.includes(route.name);
  const [toast, setToast] = useState(null);
  const notify = useCallback((type, message) => { setToast({ type, message }); window.clearTimeout(notify.timer); notify.timer = window.setTimeout(() => setToast(null), 4000); }, []);
  const render = () => {
    const props = { session, navigate, notify, onSessionUpdate };
    if (isSalon && session.isNewSalon && route.name !== 'editProfile') return <EditSalonProfileScreen {...props} params={{ ...(route.params || {}), isOnboarding: 'true' }} />;
    if (!isSalon) {
      if (route.name === 'home') return <HomeScreen {...props} />;
      if (route.name === 'bookings') return <BookingsScreen {...props} />;
      if (route.name === 'products') return <ProductsScreen {...props} />;
      if (route.name === 'account') return <AccountScreen {...props} onLogout={onLogout} />;
      if (route.name === 'detail') return <SalonDetailScreen {...props} params={route.params} />;
      if (route.name === 'services') return <ServicesScreen {...props} params={route.params} />;
      if (route.name === 'schedule') return <ScheduleScreen {...props} params={route.params} />;
      if (route.name === 'notifications') return <NotificationsScreen {...props} />;
      if (route.name === 'delay') return <DelayRequestScreen {...props} params={route.params} />;
      if (['about', 'faq', 'terms'].includes(route.name)) return <InfoScreen type={route.name} navigate={navigate} />;
      return <HomeScreen {...props} />;
    }
    if (route.name === 'queue') return <SalonQueueScreen {...props} />;
    if (route.name === 'history') return <SalonHistoryScreen {...props} />;
    if (route.name === 'salonProducts') return <SalonProductsScreen {...props} />;
    if (route.name === 'account') return <SalonAccountScreen {...props} />;
    if (route.name === 'notifications') return <NotificationsScreen {...props} />;
    if (route.name === 'editProfile') return <EditSalonProfileScreen {...props} params={route.params} />;
    if (route.name === 'bookingRequest') return <BookingRequestScreen {...props} params={route.params} />;
    if (route.name === 'subscription') return <SubscriptionScreen {...props} params={route.params} />;
    if (route.name === 'salonAbout') return <PartnerInfo type="about" navigate={navigate} />;
    if (route.name === 'salonFaq') return <PartnerInfo type="faq" navigate={navigate} />;
    if (route.name === 'salonTerms') return <PartnerInfo type="terms" navigate={navigate} />;
    return <SalonQueueScreen {...props} />;
  };
  return <div className={cx('app-shell', isSalon && 'salon-shell', !showBottomNav && 'utility-shell')}><Sidebar session={session} nav={nav} route={route} navigate={navigate} onLogout={onLogout} notifyInstall={notifyInstall} /><main className="workspace"><div className="mobile-shell-bar"><Brand /><button className="mobile-menu-button" aria-label="Open menu"><Menu size={20} /></button></div><div className={cx('workspace-content', utilityRoutes.includes(route.name) && 'utility-content')}>{!session.demo && <NotificationSetupCard authenticated />}{render()}</div></main>{showBottomNav && <MobileNav nav={nav} route={route} navigate={navigate} />}{toast && <div className="toast-position"><div className={cx('toast', `toast-${toast.type || 'info'}`)} role="status"><span className="toast-mark">{toast.type === 'error' ? '!' : '✓'}</span><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div></div>}</div>;
}

function Sidebar({ session, nav, route, navigate, onLogout, notifyInstall }) {
  const isSalon = session.role === 'SALON';
  return <aside className="sidebar"><Brand /><div className="sidebar-role"><span className="role-mark">{isSalon ? <Store size={15} /> : <Scissors size={15} />}</span><span><small>Signed in as</small><strong>{isSalon ? 'Salon partner' : 'Customer'}</strong></span></div><nav className="sidebar-nav">{nav.map(item => <button key={item.name} className={route.name === item.name ? 'active' : ''} onClick={() => navigate(item.name)}><item.icon size={18} /><span>{item.label}</span>{route.name === item.name && <i />}</button>)}</nav><div className="sidebar-bottom">{notifyInstall && <button className="install-side-button" onClick={notifyInstall}><Download size={16} /><span>Install MyNaai</span></button>}<div className="sidebar-tip"><Sparkles size={16} /><p>{isSalon ? 'Keep your profile fresh to stand out nearby.' : 'Your next great look is closer than you think.'}</p></div><button className="sidebar-logout" onClick={onLogout}><LogOut size={16} /> Sign out</button></div></aside>;
}

function MobileNav({ nav, route, navigate }) { return <nav className="mobile-nav">{nav.map(item => <button key={item.name} className={route.name === item.name ? 'active' : ''} onClick={() => navigate(item.name)}><item.icon size={20} /><span>{item.label.replace('Customer ', '').replace('My ', '')}</span></button>)}</nav>; }

function PartnerInfo({ type, navigate }) { const content = type === 'about' ? SALON_ABOUT_CONTENT : type === 'faq' ? SALON_FAQ_CONTENT : SALON_TERMS_CONTENT; return <div className="screen info-screen"><div className="page-header"><div className="page-header-leading"><button className="icon-btn ghost" onClick={() => navigate(-1)} aria-label="Go back"><ChevronRight size={19} className="rotate-180" /></button><div><span className="eyebrow">{content.eyebrow}</span><h1>{content.title}</h1></div></div></div><div className="info-intro"><Sparkles size={18} /><p>{content.intro || 'Everything you need to know about partnering with MyNaai.'}</p></div><div className="info-sections">{content.sections.map(section => <section key={section.title}><h2>{section.title}</h2><p>{section.text}</p></section>)}</div><div className="info-contact"><span className="info-contact-icon"><HelpCircle size={18} /></span><div><strong>Need more help?</strong><p>Call our partner team on 8380017393</p></div><button onClick={() => window.open('tel:8380017393')}><ChevronRight size={17} /></button></div></div>; }

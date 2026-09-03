import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { api, clearSession, getToken, setToken } from './lib/api';
import { closeNotification, deletePushToken, displayNotification, getNotificationRoute, getPushStatus, getPushToken, isActionableNotification, normalizePushPayload, recordForegroundMessage, setupPush } from './lib/push';
import { playBuzzer, unlockBuzzer } from './lib/buzzer';
import { resetLiveUpdatesSocket } from './lib/socket';
import { DEFAULT_SERVICES } from './lib/defaultServices';
import { getSubscriptionState } from './lib/planDetails';
import { STATE_OPTIONS } from './lib/stateOptions';
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
  SalonAccountScreen,
  SalonHistoryScreen,
  SalonProductsScreen,
  SalonQueueScreen,
} from './components/SalonScreens';
import { SubscriptionScreen } from './components/SubscriptionScreen';
import { SALON_ABOUT_CONTENT, SALON_FAQ_CONTENT, SALON_TERMS_CONTENT } from './lib/salonContent';
import { Button, Field, SelectField, Spinner, getBrowserLocation, getErrorMessage, cx } from './components/Shared';

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
  if (!loggedIn || !role || !getToken()) return null;
  let user = {};
  try { user = JSON.parse(localStorage.getItem('mynaaiUser') || '{}'); } catch (parseError) { console.debug(getErrorMessage(parseError, 'Stored session data was invalid.')); user = {}; }
  const userId = user?.userId || user?.salon?.salonId || user?.salonId || user?.id || '';
  const incompleteSalon = String(role).toUpperCase() === 'SALON' && (flagIsTrue(user?.isNewSalon) || flagIsFalse(user?.profileCompleted) || flagIsFalse(user?.salon?.profileCompleted));
  return { role, user, userId, isNewSalon: localStorage.getItem('isNewSalon') === 'true' || incompleteSalon };
}

function saveSession(session) {
  const role = String(session.role || '').toUpperCase();
  const user = session.user || {};
  if (session.token) setToken(session.token);
  localStorage.setItem('mynaaiUser', JSON.stringify(user));
  localStorage.setItem('userType', role);
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('isNewSalon', session.isNewSalon ? 'true' : 'false');
  return { ...session, role, userId: session.userId || user?.userId || user?.salon?.salonId || user?.salonId || user?.id || '' };
}

const PUSH_REQUIRED_MESSAGE = 'Browser notifications are required to continue. Allow notifications for this site, then try again.';

async function requirePushToken() {
  const token = await getPushToken({ requestPermission: true });
  if (!token) throw new Error(PUSH_REQUIRED_MESSAGE);
  return token;
}

function withDeviceToken(payload, token) {
  const value = typeof token === 'string' ? token.trim() : '';
  if (!value) throw new Error(PUSH_REQUIRED_MESSAGE);
  return { ...payload, deviceToken: value };
}

function flagIsTrue(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function flagIsFalse(value) {
  return value === false || String(value).toLowerCase() === 'false';
}

function hasCoordinate(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

function getSalonSubscriptionProfile(session = {}) {
  const user = session.user || {};
  return { ...user, ...(user.salon || {}) };
}

function getSalonSubscriptionState(session = {}) {
  return getSubscriptionState(getSalonSubscriptionProfile(session));
}

function isPlanExpiredResponse(result) {
  const candidates = [result?.status, result?.error, result?.code, result?.errorCode, result?.data?.status, result?.data?.error, result?.data?.code, result?.data?.errorCode];
  return candidates.some(value => String(value || '').toUpperCase() === 'PLAN_EXPIRED');
}

function isUnknownSalonResponse(result) {
  const source = result?.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : result;
  const code = `${result?.status || result?.code || result?.errorCode || source?.status || source?.code || source?.errorCode || ''}`.toUpperCase();
  const message = `${result?.message || result?.error || source?.message || source?.error || ''}`.toLowerCase();
  return /not[_ -]?found|not[_ -]?registered|no salon|does not exist|register as|sign up/.test(`${code} ${message}`);
}

function salonNeedsProfileCompletion(profile = {}) {
  if (flagIsFalse(profile.profileCompleted) || flagIsTrue(profile.isNewSalon)) return true;
  const hasProfileShape = ['salonName', 'ownerName', 'addressLine1', 'genderType', 'latitude', 'longitude', 'services', 'businessHours'].some(key => Object.prototype.hasOwnProperty.call(profile, key));
  if (!hasProfileShape) return true;
  const businessHours = Array.isArray(profile.businessHours) ? profile.businessHours[0] : profile.businessHours;
  return !String(profile.ownerName || '').trim() || !String(profile.salonName || '').trim() || !String(profile.addressLine1 || '').trim() || !profile.genderType || !hasCoordinate(profile.latitude) || !hasCoordinate(profile.longitude) || !Array.isArray(profile.services) || profile.services.length === 0 || !businessHours?.openingTime || !businessHours?.closingTime;
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

// Booking buzzers, delay requests and appointment updates are a core My Naai
// feature and the backend expects a deviceToken, so this card explains exactly
// why push is unavailable instead of staying silent while sign-in is blocked.
function NotificationSetupCard({ compact = false, notifyInstall = null }) {
  const [status, setStatus] = useState('checking');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const inspect = useCallback(async (requestPermission = false) => {
    const result = await getPushStatus();
    if (result.state === 'needs-permission' && requestPermission) {
      const token = await getPushToken({ requestPermission: true });
      setStatus(token ? 'enabled' : 'unavailable');
      setReason(token ? '' : 'We could not prepare notifications for this browser. Please try again.');
      return;
    }
    setStatus(result.state);
    setReason(result.reason || '');
  }, []);

  useEffect(() => { let active = true; getPushStatus().then(result => { if (active) { setStatus(result.state); setReason(result.reason || ''); } }); return () => { active = false; }; }, []);

  const enable = async () => {
    setBusy(true);
    try { await inspect(true); } finally { setBusy(false); }
  };

  if (['checking', 'enabled'].includes(status)) return null;
  const copy = {
    unconfigured: { title: 'Browser notifications are required', body: reason || 'Notifications have not been enabled for this build yet — please contact My Naai support.' },
    unsupported: { title: 'This browser cannot receive My Naai notifications', body: reason || 'Switch to Chrome, Edge or Samsung Internet, or install My Naai to your home screen on iPhone and iPad.' },
    denied: { title: 'Notifications are blocked', body: 'Open this site’s browser permissions, set Notifications to Allow, then try again.' },
    'needs-permission': { title: 'Notifications are required', body: 'Allow browser notifications to receive booking buzzers, delay requests and appointment updates.' },
    unavailable: { title: 'Notification access needs a retry', body: reason || 'We could not prepare browser notifications. Check the site permission and try again.' },
  }[status] || { title: 'Notifications unavailable', body: reason };
  const canRetry = !['unsupported'].includes(status);
  return (
    <section className={cx('push-setup-card', compact && 'push-setup-compact')} aria-live="polite">
      <span className="push-setup-icon"><Bell size={compact ? 15 : 18} /></span>
      <div className="push-setup-copy"><strong>{copy.title}</strong><p>{copy.body}</p></div>
      {status === 'unsupported' && notifyInstall && <Button size="small" onClick={notifyInstall}><Download size={14} /> Install app</Button>}
      {canRetry && <Button size="small" onClick={enable} loading={busy}>{status === 'denied' || status === 'unavailable' ? 'Try again' : 'Enable alerts'}</Button>}
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
  // Unlock the Web Audio buzzer on the first user gesture so a later booking
  // buzz can actually make a sound (browsers block audio until an interaction).
  useEffect(() => {
    const unlock = () => unlockBuzzer();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  const completeAuth = useCallback(async nextSession => {
    let resolvedSession = nextSession;
    // Some salon login responses expose isNewSalon while others only expose
    // profileCompleted on the profile endpoint. Check both so an incomplete
    // partner can never briefly land on the normal queue dashboard.
    const role = String(nextSession?.role).toUpperCase();
    const alreadyIncomplete = flagIsTrue(nextSession?.isNewSalon) || flagIsFalse(nextSession?.user?.profileCompleted) || flagIsFalse(nextSession?.user?.salon?.profileCompleted);
    if (role === 'SALON' && alreadyIncomplete) {
      resolvedSession = { ...nextSession, isNewSalon: true };
    } else if (role === 'SALON' && nextSession.userId) {
      if (nextSession.token) setToken(nextSession.token);
      try {
        const response = await api.salonProfile({ salonId: nextSession.userId });
        const profileData = response?.data?.salon || response?.data || {};
        const fetchedProfile = {
          ...profileData,
          ...(profileData.profileCompleted === undefined && response?.profileCompleted !== undefined ? { profileCompleted: response.profileCompleted } : {}),
          ...(profileData.isNewSalon === undefined && response?.isNewSalon !== undefined ? { isNewSalon: response.isNewSalon } : {}),
        };
        const planState = getSubscriptionState(fetchedProfile);
        const profilePatch = {
          ...(nextSession.user || {}),
          ...fetchedProfile,
          ...(planState.expired ? { subscriptionExpired: true } : {}),
        };
        resolvedSession = {
          ...nextSession,
          user: profilePatch,
          ...(planState.expired ? { subscriptionExpired: true } : {}),
          ...(salonNeedsProfileCompletion(fetchedProfile) ? { isNewSalon: true } : {}),
        };
      } catch (profileError) {
        console.debug(getErrorMessage(profileError, 'Could not preflight salon profile completion.'));
        // A plan-expired response is authoritative even when the profile call
        // is rejected. Preserve the existing safe onboarding fallback for any
        // other profile error so an incomplete salon cannot reach the dashboard.
        resolvedSession = isPlanExpiredResponse(profileError)
          ? { ...nextSession, subscriptionExpired: true, user: { ...(nextSession.user || {}), subscriptionExpired: true } }
          : { ...nextSession, isNewSalon: true };
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
  const logout = useCallback(() => { clearSession(); resetLiveUpdatesSocket(); setSession(null); setRoute({ name: 'home', params: {} }); window.history.replaceState({}, '', '#/'); }, []);
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
      if (['mynaai', 'mynaaiUser', 'userType', 'isLoggedIn', 'isNewSalon'].includes(event.key)) {
        const next = readStoredSession();
        setSession(next);
        if (next) setRoute(getRouteFromHash(next.role));
      }
    };
    const onSessionExpired = () => { deletePushToken().catch(error => console.debug(getErrorMessage(error, 'Could not clear the browser notification token.'))); resetLiveUpdatesSocket(); setSession(null); setRoute({ name: 'home', params: {} }); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('mynaai:session-expired', onSessionExpired);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('mynaai:session-expired', onSessionExpired);
    };
  }, []);
  useEffect(() => {
    if (session?.role !== 'SALON') return undefined;
    const onPlanExpired = () => forceSalonRenewal();
    window.addEventListener('mynaai:plan-expired', onPlanExpired);
    return () => window.removeEventListener('mynaai:plan-expired', onPlanExpired);
  }, [forceSalonRenewal, session?.role]);
  const install = async () => {
    const promptEvent = installPrompt;
    if (!promptEvent) return;
    try {
      promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (installError) {
      console.debug(getErrorMessage(installError, 'Could not open the install prompt.'));
    } finally {
      setInstallPrompt(null);
    }
  };
  if (!session) return <AuthFlow onComplete={completeAuth} notifyInstall={installPrompt ? install : null} />;
  return <AppShell session={session} route={route} navigate={navigate} onLogout={logout} onSessionUpdate={updateSessionUser} notifyInstall={installPrompt ? install : null} />;
}

function AuthFlow({ onComplete, notifyInstall }) {
  const [view, setView] = useState(() => localStorage.getItem('hasSeenOnboarding') === 'true' ? 'login' : 'onboarding');
  const [slide, setSlide] = useState(0);
  const [role, setRole] = useState('USER');
  const [salonAuthMode, setSalonAuthMode] = useState('login');
  const [salonRegistrationData, setSalonRegistrationData] = useState(null);
  const [step, setStep] = useState('phone');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [pushToken, setPushToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onboarding = [{ image: '/assets/naai/naai3.jpg', kicker: 'THE PROFESSIONAL SPECIALISTS', title: 'Your next good look is closer than you think.', text: 'Find trusted barbers and salons around your location.' }, { image: '/assets/naai/naai2.jpeg', kicker: 'A LITTLE MORE YOU', title: 'Book the service. Skip the waiting room.', text: 'Haircut, beard, spa and more — choose a time that works for you.' }, { image: '/assets/naai/naai1.jpg', kicker: 'MADE FOR YOUR TIME', title: 'Good style, without the guesswork.', text: 'See availability, pick your specialist and arrive ready.' }];
  const finishOnboarding = () => { localStorage.setItem('hasSeenOnboarding', 'true'); setView('login'); };
  const requestOtp = async event => {
    event.preventDefault();
    if (!/^\d{10}$/.test(mobile)) return setError('Enter a valid 10-digit mobile number.');
    setBusy(true);
    setError('');
    try {
      const token = await requirePushToken();
      setPushToken(token);
      let response;
      let nextSalonAuthMode = 'login';
      if (role === 'USER') {
        response = await api.userLogin({ phoneNumber: mobile });
      } else {
        try {
          response = await api.SalonLogin({ phoneNumber: mobile });
        } catch (loginError) {
          if (!isUnknownSalonResponse(loginError)) throw loginError;
          response = await api.salonOwnerLogin({ phoneNumber: mobile });
          nextSalonAuthMode = 'register';
        }
        if (response?.status !== 'SUCCESS' && isUnknownSalonResponse(response)) {
          response = await api.salonOwnerLogin({ phoneNumber: mobile });
          nextSalonAuthMode = 'register';
        }
      }
      if (response?.status !== 'SUCCESS') throw new Error(response?.message || 'Could not send OTP.');
      setSalonAuthMode(nextSalonAuthMode);
      setStep('otp');
      setOtp('');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not send OTP. Please try again.'));
    } finally { setBusy(false); }
  };
  const verify = async event => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit OTP.');
    setBusy(true); setError('');
    try {
      const deviceToken = pushToken || await requirePushToken();
      const payload = withDeviceToken({ phoneNumber: mobile, otp }, deviceToken);
      let verifyMode = salonAuthMode;
      let response;
      if (role === 'USER') {
        response = await api.verifyLogin(payload);
      } else if (verifyMode === 'register') {
        response = await api.verifySalonOwnerLogin(payload);
      } else {
        try {
          response = await api.verifySalonLogin(payload);
        } catch (loginError) {
          if (!isUnknownSalonResponse(loginError)) throw loginError;
          response = await api.verifySalonOwnerLogin(payload);
          verifyMode = 'register';
        }
        if (response?.status !== 'SUCCESS' && isUnknownSalonResponse(response)) {
          response = await api.verifySalonOwnerLogin(payload);
          verifyMode = 'register';
        }
      }
      if (response?.status !== 'SUCCESS') throw new Error(response?.message || 'OTP verification failed.');
      if (role === 'USER' && flagIsFalse(response.isUserExist)) { setStep('new-user'); setOtp(''); setError(''); return; }
      const user = response.data || {};
      if (!user.token) throw new Error('No login session was returned. Please request a new OTP.');
      if (role === 'SALON' && verifyMode === 'register') {
        setSalonRegistrationData({ mobile, tempToken: user.token, pushToken: deviceToken });
        setView('register');
        setStep('phone');
        return;
      }
      const userId = user.userId || user.salon?.salonId || user.salonId;
      if (role === 'SALON' && !userId) throw new Error('Salon login completed without a salon ID. Please try again.');
      const isNewSalon = role === 'SALON' && (flagIsTrue(response.isNewSalon) || flagIsTrue(user.isNewSalon) || flagIsFalse(user.profileCompleted) || flagIsFalse(user.salon?.profileCompleted));
      onComplete({ role, token: user.token, user, userId, isNewSalon });
    } catch (verifyError) { setError(getErrorMessage(verifyError, 'That code did not work. Please try again.')); } finally { setBusy(false); }
  };
  const createAccount = async event => {
    event.preventDefault();
    if (!name.trim()) return setError('Tell us your name to finish setting up.');
    setBusy(true); setError('');
    try { const deviceToken = pushToken || await requirePushToken(); const response = await api.userOnBoard(withDeviceToken({ phoneNumber: mobile, fullName: name.trim() }, deviceToken)); if (response?.status !== 'SUCCESS') throw new Error(response?.message || 'Could not create account.'); if (!response.data?.token) throw new Error('Your account was created, but no login session was returned. Please try again.'); onComplete({ role: 'USER', token: response.data.token, user: response.data, userId: response.data?.userId }); } catch (createError) { setError(getErrorMessage(createError, 'Could not create your account.')); } finally { setBusy(false); }
  };
  if (view === 'onboarding') return <div className="auth-page onboarding-page"><div className="onboarding-slide" style={{ backgroundImage: `url(${onboarding[slide].image})` }}><div className="auth-image-shade" /><div className="onboarding-top"><Brand light /><div className="onboarding-top-actions">{notifyInstall && <button className="install-auth-button" onClick={notifyInstall}><Download size={14} /> Install app</button>}<button className="skip-button" onClick={finishOnboarding}>Skip</button></div></div><div className="onboarding-copy"><span className="eyebrow">{onboarding[slide].kicker}</span><h1>{onboarding[slide].title}</h1><p>{onboarding[slide].text}</p><NotificationSetupCard compact /><div className="onboarding-controls"><div className="onboarding-dots">{onboarding.map((item, index) => <button key={item.kicker} className={index === slide ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`Slide ${index + 1}`} />)}</div>{slide === onboarding.length - 1 ? <Button size="large" className="lets-start-button" onClick={finishOnboarding}><Sparkles size={18} /> Let's Start</Button> : <button className="next-circle" onClick={() => setSlide(current => current + 1)} aria-label="Next"><ChevronRight size={22} /></button>}</div></div></div></div>;
  if (view === 'register') return <SalonRegistration initialData={salonRegistrationData} onBack={() => { setSalonRegistrationData(null); setView('login'); }} onComplete={onComplete} notifyInstall={notifyInstall} />;
  return <div className="auth-page login-page"><div className="auth-visual"><div className="auth-visual-image" /><div className="auth-image-shade" /><div className="auth-visual-content"><Brand light /><div><span className="eyebrow">SALON & GROOMING, REIMAGINED</span><h1>Less waiting.<br /><em>More you.</em></h1><p>Book a great salon nearby and make the time yours.</p></div><div className="visual-quote"><span>“</span><p>Your time is valuable. We’re here to give it back.</p></div></div></div><div className="auth-form-panel"><div className="mobile-auth-brand"><Brand /></div><div className="auth-form-wrap"><span className="eyebrow">WELCOME TO MY NAAI</span><h1>{step === 'phone' ? role === 'USER' ? 'Ready when you are.' : 'Welcome, salon partner.' : step === 'new-user' ? 'One last thing.' : 'Check your phone.'}</h1><p className="auth-subtitle">{step === 'phone' ? role === 'USER' ? 'Find your next appointment without the wait.' : 'Manage your queue and grow your local business.' : step === 'new-user' ? `Let’s create your My Naai profile for +91 ${mobile}.` : `Enter the 6-digit code sent to +91 ${mobile}.`}</p>{step === 'phone' && notifyInstall && <button className="install-auth-button install-login-button" onClick={notifyInstall}><Download size={14} /> Install app</button>}{step === 'phone' && <NotificationSetupCard />}{step === 'phone' && <div className="role-switch"><button className={role === 'USER' ? 'active' : ''} onClick={() => { setRole('USER'); setError(''); }}><CircleUserRound size={16} /> Customer</button><button className={role === 'SALON' ? 'active' : ''} onClick={() => { setRole('SALON'); setError(''); }}><Store size={16} /> Salon partner</button></div>}{error && <div className="form-error" role="alert"><Info size={16} />{error}</div>}{step === 'phone' && <form onSubmit={requestOtp}><Field label="Mobile number"><div className="phone-input"><span>+91</span><input inputMode="numeric" autoComplete="tel" maxLength="10" value={mobile} onChange={event => setMobile(event.target.value.replace(/\D/g, ''))} placeholder="Enter 10-digit number" autoFocus /></div></Field><Button type="submit" loading={busy}>Continue with OTP <ChevronRight size={17} /></Button></form>}{step === 'otp' && <form onSubmit={verify}><Field label="One-time password"><input className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} placeholder="· · · · · ·" autoFocus /></Field><Button type="submit" loading={busy}>Verify code <ChevronRight size={17} /></Button><button className="resend-link" type="button" onClick={requestOtp}>Resend code</button><button className="back-form-link" type="button" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>Use a different number</button></form>}{step === 'new-user' && <form onSubmit={createAccount}><Field label="Your name"><input value={name} onChange={event => setName(event.target.value)} placeholder="How should we call you?" autoFocus /></Field><Button type="submit" loading={busy}>Create my account <ChevronRight size={17} /></Button></form>}</div><p className="auth-legal">By continuing, you agree to My Naai’s terms and privacy policy.</p></div></div>;
}

function SalonRegistration({ initialData, onBack, onComplete, notifyInstall }) {
  const [step, setStep] = useState('profile');
  const mobile = initialData?.mobile || '';
  const tempToken = initialData?.tempToken || '';
  const pushToken = initialData?.pushToken || '';
  const [profile, setProfile] = useState({ ownerName: '', salonName: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', email: '' });
  const [business, setBusiness] = useState({ genderType: '', openingTime: '09:00', closingTime: '22:00', agentCode: '' });
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [busy, setBusy] = useState(false);
  const [registrationPushToken, setRegistrationPushToken] = useState(pushToken);
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
    if (latitude === null && longitude === null) detectLocation();
  }, [detectLocation, latitude, longitude]);
  const continueProfile = event => {
    event.preventDefault();
    if (!profile.ownerName.trim() || !profile.salonName.trim() || !profile.addressLine1.trim()) return setError('Please complete your name, salon name and address.');
    if (profile.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) return setError('Please enter a valid email address.');
    if (profile.pincode.trim() && !/^\d{6}$/.test(profile.pincode.trim())) return setError('Pincode must contain 6 digits.');
    setError('');
    setStep('business');
  };
  const continueBusiness = async event => {
    event.preventDefault();
    if (!business.genderType) return setError('Choose a salon type.');
    if (business.agentCode && !/^\d{10}$/.test(business.agentCode)) return setError('Agent code must be exactly 10 digits or blank.');
    if (business.openingTime === business.closingTime) return setError('Opening and closing time cannot be the same.');
    setError('');
    setBusy(true);
    try {
      const currentLocation = latitude !== null && longitude !== null ? { latitude, longitude } : await detectLocation();
      if (!currentLocation) throw new Error('Detect your salon location before continuing.');
      const token = await requirePushToken();
      setStep('plans');
      // Keep the freshly generated token in the registration payload even when
      // the React state update is still being batched for the next render.
      setRegistrationPushToken(token);
    } catch (businessError) {
      setError(getErrorMessage(businessError, PUSH_REQUIRED_MESSAGE));
    } finally { setBusy(false); }
  };
  if (step === 'plans') return <SubscriptionScreen params={{ registrationData: { ...profile, phoneNumber: mobile, tempToken, genderType: business.genderType, agentCode: business.agentCode, deviceToken: registrationPushToken, latitude: Number(latitude), longitude: Number(longitude), businessHours: { openingTime: `${business.openingTime}:00`, closingTime: `${business.closingTime}:00`, breakStartTime: null, breakEndTime: null }, services: DEFAULT_SERVICES[business.genderType.toLowerCase()] || [] }, onBack }} notify={(type, message) => setError(message)} onAuthComplete={onComplete} />;
  const title = step === 'profile' ? 'Tell us about you.' : 'Set up your day.';
  return <div className="auth-page registration-page"><div className="registration-back"><button className="icon-btn ghost" onClick={step === 'profile' ? onBack : () => setStep('profile')} aria-label="Go back"><ChevronRight size={19} className="rotate-180" /></button><Brand />{notifyInstall && <button className="install-auth-button registration-install-button" onClick={notifyInstall}><Download size={14} /> Install app</button>}</div><div className="registration-card"><div className="registration-progress"><span className="active" /><span className={step === 'business' ? 'active' : ''} /><span /><span /></div><span className="eyebrow">SALON PARTNER · STEP {step === 'profile' ? '2' : '3'} OF 3</span><h1>{title}</h1><p className="auth-subtitle">{step === 'profile' ? 'A few details help customers find you.' : 'Tell us when you are ready for your next customer.'}</p><NotificationSetupCard compact />{error && <div className="form-error"><Info size={16} />{error}</div>}{step === 'profile' && <form onSubmit={continueProfile}><Field label="Mobile number"><div className="phone-input"><span>+91</span><input inputMode="numeric" value={mobile} readOnly aria-label="Registered mobile number" /></div></Field><Field label="Owner name"><input value={profile.ownerName} onChange={event => setProfile(current => ({ ...current, ownerName: event.target.value }))} placeholder="Your full name" autoFocus /></Field><Field label="Salon name"><input value={profile.salonName} onChange={event => setProfile(current => ({ ...current, salonName: event.target.value }))} placeholder="What is your salon called?" /></Field><Field label="Address line 1"><textarea rows="3" value={profile.addressLine1} onChange={event => setProfile(current => ({ ...current, addressLine1: event.target.value }))} placeholder="Area, street, building" /></Field><Field label="Address line 2" hint="Optional"><input value={profile.addressLine2} onChange={event => setProfile(current => ({ ...current, addressLine2: event.target.value }))} placeholder="Landmark" /></Field><div className="form-two-col"><Field label="City"><input value={profile.city} onChange={event => setProfile(current => ({ ...current, city: event.target.value }))} placeholder="City" /></Field><SelectField label="State" value={profile.state} onChange={event => setProfile(current => ({ ...current, state: event.target.value }))} options={STATE_OPTIONS} placeholder="Select state" /></div><div className="form-two-col"><Field label="Pincode" hint="Optional"><input inputMode="numeric" maxLength="6" value={profile.pincode} onChange={event => setProfile(current => ({ ...current, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="Pincode" /></Field><Field label="Email" hint="Optional"><input type="email" value={profile.email} onChange={event => setProfile(current => ({ ...current, email: event.target.value }))} placeholder="owner@example.com" /></Field></div><div className={cx('registration-location', latitude !== null && longitude !== null && 'ready')}><MapPin size={15} /><span>{latitude !== null && longitude !== null ? `Location ready · ${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)}` : locationError || 'Detecting salon location…'}</span><button type="button" onClick={detectLocation} disabled={locationBusy}>{locationBusy ? 'Detecting…' : 'Retry'}</button></div><Button type="submit">Next <ChevronRight size={17} /></Button></form>}{step === 'business' && <form onSubmit={continueBusiness}><label className="field"><span className="field-label">Salon type</span><div className="type-option-grid">{['MALE', 'FEMALE', 'UNISEX'].map(type => <button type="button" key={type} className={business.genderType === type ? 'active' : ''} onClick={() => setBusiness(current => ({ ...current, genderType: type }))}>{type === 'UNISEX' ? 'Unisex' : `${type.charAt(0)}${type.slice(1).toLowerCase()}`}</button>)}</div></label><div className="form-two-col"><Field label="Opens"><input type="time" value={business.openingTime} onChange={event => setBusiness(current => ({ ...current, openingTime: event.target.value }))} /></Field><Field label="Closes"><input type="time" value={business.closingTime} onChange={event => setBusiness(current => ({ ...current, closingTime: event.target.value }))} /></Field></div><Field label="Agent code" hint="Optional · exactly 10 digits"><input inputMode="numeric" maxLength="10" value={business.agentCode} onChange={event => setBusiness(current => ({ ...current, agentCode: event.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="Optional agent code" /></Field><Button type="submit" loading={busy}>Choose a plan <ChevronRight size={17} /></Button></form>}</div></div>;
}
function Brand({ light = false }) {
  return <div className={cx('brand', light && 'brand-light')}><div className="brand-symbol"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="currentColor"><polygon points="21,19 27,19 30.5,28 16,28" /><polygon points="37,19 43,19 47,28 33,28" /><polygon points="31.5,27.5 41.5,27.5 39.5,34.5 29,34.5" /><rect x="13" y="33.5" width="37.5" height="2" /><polygon points="13,34.5 23.5,34.5 18.75,44 9,44" /><polygon points="25.5,34.5 38.5,34.5 35,44 29,44" /><polygon points="40.5,34.5 50.5,34.5 54.5,44 45,44" /></g></svg></div><span>My <span>Naai</span></span></div>;
}

function AppShell({ session, route, navigate, onLogout, onSessionUpdate, notifyInstall }) {
  const isSalon = session.role === 'SALON';
  const nav = isSalon ? SALON_NAV : USER_NAV;
  const primaryRoutes = nav.map(item => item.name);
  const utilityRoutes = ['detail', 'services', 'schedule', 'notifications', 'delay', 'about', 'faq', 'terms', 'salonAbout', 'salonFaq', 'salonTerms', 'subscription', 'editProfile', 'bookingRequest'];
  const showBottomNav = primaryRoutes.includes(route.name);
  const [toast, setToast] = useState(null);
  const notify = useCallback((type, message) => { setToast({ type, message }); window.clearTimeout(notify.timer); notify.timer = window.setTimeout(() => setToast(null), 4000); }, []);
  const cachedSubscription = useMemo(() => getSalonSubscriptionState(session), [session]);
  const [subscriptionGate, setSubscriptionGate] = useState(() => {
    if (!isSalon || session.isNewSalon) return 'active';
    // Even a cached active plan is revalidated before a partner screen mounts;
    // expiry can happen while the portal is closed.
    return cachedSubscription.expired ? 'locked' : 'checking';
  });
  const routeName = useRef(route.name);
  useEffect(() => { routeName.current = route.name; }, [route.name]);

  // A salon subscription is checked before any partner screen is mounted. This
  // prevents a stale queue/account route from flashing or being usable while the
  // server already considers the plan expired. Customer sessions never enter
  // this gate.
  useEffect(() => {
    if (!isSalon || session.isNewSalon) {
      setSubscriptionGate('active');
      return undefined;
    }
    const cached = getSalonSubscriptionState(session);
    if (cached.expired) {
      setSubscriptionGate('locked');
      return undefined;
    }

    let cancelled = false;
    let expiryTimer;
    setSubscriptionGate('checking');
    const scheduleExpiry = plan => {
      const expiryTime = plan?.expiryDate ? new Date(plan.expiryDate).getTime() : NaN;
      if (!Number.isFinite(expiryTime)) return;
      const delay = expiryTime - Date.now();
      if (delay <= 0) {
        setSubscriptionGate('locked');
        return;
      }
      expiryTimer = window.setTimeout(() => {
        if (!cancelled) setSubscriptionGate('locked');
      }, delay + 1);
    };

    api.salonProfile({ salonId: session.userId })
      .then(response => {
        if (cancelled) return;
        if (isPlanExpiredResponse(response)) {
          setSubscriptionGate('locked');
          return;
        }
        const profile = response?.data?.salon || response?.data || {};
        const state = getSubscriptionState(profile);
        if (state.expired) {
          setSubscriptionGate('locked');
          return;
        }
        scheduleExpiry(state.plan);
        // A profile without subscription fields is treated as unknown rather
        // than expired. The API remains the source of truth for restricted
        // actions and will emit PLAN_EXPIRED if the account is actually blocked.
        setSubscriptionGate('active');
      })
      .catch(error => {
        if (cancelled) return;
        setSubscriptionGate(isPlanExpiredResponse(error) ? 'locked' : 'active');
      });

    return () => {
      cancelled = true;
      if (expiryTimer) window.clearTimeout(expiryTimer);
    };
  }, [isSalon, session.isNewSalon, session.userId]);

  // A server-side PLAN_EXPIRED response can arrive after the initial check (for
  // example exactly at midnight). It is a hard redirect, not a dismissible
  // warning, and the renewal screen is the only salon view left mounted.
  const forceSalonRenewal = useCallback(() => {
    setSubscriptionGate('locked');
    if (route.name !== 'subscription' || route.params?.mode !== 'RENEW' || !flagIsTrue(route.params?.forceRenewal)) {
      navigate('subscription', { mode: 'RENEW', forceRenewal: true }, { replace: true });
    }
  }, [navigate, route.name, route.params]);

  useEffect(() => {
    if (!isSalon || subscriptionGate !== 'locked') return;
    if (route.name !== 'subscription' || route.params?.mode !== 'RENEW' || !flagIsTrue(route.params?.forceRenewal)) {
      navigate('subscription', { mode: 'RENEW', forceRenewal: true }, { replace: true });
    }
  }, [isSalon, navigate, route.name, route.params, subscriptionGate]);

  // Foreground web push: FCM hands these messages to the page instead of the OS,
  // so My Naai renders the notification itself, toasts it, and only auto-navigates
  // for time-critical actions (a salon booking request, a delay proposal). An
  // informational message must never yank a customer out of the booking flow.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    setupPush({
      onMessage: payload => {
        if (cancelled) return;
        const message = normalizePushPayload(payload);
        recordForegroundMessage(message);
        displayNotification({ title: message.title, body: message.body, data: message.data });
        notify('info', `${message.title}${message.body && message.body !== message.title ? ` — ${message.body}` : ''}`);
        // Time-critical notification: sound the booking buzzer + vibrate, like
        // the mobile app. Informational messages stay silent by design.
        if (isActionableNotification(message.type, session.role)) {
          playBuzzer({ type: message.type });
        }
        if (!isActionableNotification(message.type, session.role)) return;
        const next = getNotificationRoute(message.data, session.role);
        if (!next.name || next.name === routeName.current) return;
        navigate(next.name, next.params);
      },
    }).then(result => {
      if (cancelled) result?.unsubscribe?.();
      else unsubscribe = result?.unsubscribe || (() => {});
    }).catch(pushError => {
      if (!cancelled) console.debug(getErrorMessage(pushError, 'Live browser notifications are unavailable.'));
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [navigate, notify, session.role, session.userId]);

  const handleSessionUpdate = useCallback((user = {}, sessionPatch = {}) => {
    onSessionUpdate?.(user, sessionPatch);
    if (!isSalon) return;
    const nextProfile = { ...getSalonSubscriptionProfile(session), ...(user || {}) };
    const explicitlyExpired = flagIsTrue(user?.subscriptionExpired) || flagIsTrue(sessionPatch?.subscriptionExpired);
    const explicitlyActive = flagIsFalse(user?.subscriptionExpired) || flagIsFalse(sessionPatch?.subscriptionExpired);
    const nextState = getSubscriptionState(nextProfile);
    if (explicitlyExpired || nextState.expired) setSubscriptionGate('locked');
    else if (explicitlyActive || nextState.active) setSubscriptionGate('active');
  }, [isSalon, onSessionUpdate, session]);

  const isSubscriptionLocked = isSalon && subscriptionGate === 'locked';
  const isCheckingSubscription = isSalon && !session.isNewSalon && subscriptionGate === 'checking';
  const isSubscriptionGateScreen = isSubscriptionLocked || isCheckingSubscription;
  const render = () => {
    const props = { session, navigate, notify, onSessionUpdate: handleSessionUpdate };
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
  const gateContent = isSubscriptionLocked
    ? <SubscriptionScreen {...{ session, navigate, notify }} params={{ mode: 'RENEW', forceRenewal: true }} onSessionUpdate={handleSessionUpdate} />
    : isCheckingSubscription
      ? <SubscriptionGateLoading />
      : render();
  return <div className={cx('app-shell', isSalon && 'salon-shell', isSubscriptionGateScreen && 'subscription-gate-shell', !showBottomNav && 'utility-shell')}>
    {!isSubscriptionGateScreen && <Sidebar session={session} nav={nav} route={route} navigate={navigate} onLogout={onLogout} notifyInstall={notifyInstall} />}
    <main className="workspace">
      {!isSubscriptionGateScreen && <div className="mobile-shell-bar"><Brand /><button className="mobile-menu-button" aria-label="Open menu"><Menu size={20} /></button></div>}
      <div className={cx('workspace-content', (isSubscriptionGateScreen || utilityRoutes.includes(route.name)) && 'utility-content', isSubscriptionGateScreen && 'subscription-gate-content')}>
        {isSubscriptionLocked && <div className="subscription-lock-notice" role="alert"><CircleAlert size={17} /><span><strong>Your salon subscription has expired.</strong> Renew now to unlock your salon dashboard. Customers do not make payments here.</span></div>}
        {!isSubscriptionGateScreen && route.name === 'account' && <NotificationSetupCard notifyInstall={notifyInstall} />}
        {gateContent}
      </div>
    </main>
    {!isSubscriptionGateScreen && showBottomNav && <MobileNav nav={nav} route={route} navigate={navigate} />}
    {toast && <div className="toast-position"><div className={cx('toast', `toast-${toast.type || 'info'}`)} role="status"><span className="toast-mark">{toast.type === 'error' ? '!' : '✓'}</span><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div></div>}
  </div>;
}

function SubscriptionGateLoading() {
  return <div className="subscription-gate-loading" role="status" aria-live="polite"><div className="subscription-gate-mark"><Store size={22} /></div><h1>Checking your salon subscription</h1><p>One moment while we verify access to your salon dashboard.</p><Spinner label="Checking subscription…" /></div>;
}

function Sidebar({ session, nav, route, navigate, onLogout, notifyInstall }) {
  const isSalon = session.role === 'SALON';
  return <aside className="sidebar"><Brand /><div className="sidebar-role"><span className="role-mark">{isSalon ? <Store size={15} /> : <Scissors size={15} />}</span><span><small>Signed in as</small><strong>{isSalon ? 'Salon partner' : 'Customer'}</strong></span></div><nav className="sidebar-nav">{nav.map(item => <button key={item.name} className={route.name === item.name ? 'active' : ''} onClick={() => navigate(item.name)}><item.icon size={18} /><span>{item.label}</span>{route.name === item.name && <i />}</button>)}</nav><div className="sidebar-bottom">{notifyInstall && <button className="install-side-button" onClick={notifyInstall}><Download size={16} /><span>Install My Naai</span></button>}<div className="sidebar-tip"><Sparkles size={16} /><p>{isSalon ? 'Keep your profile fresh to stand out nearby.' : 'Your next great look is closer than you think.'}</p></div><button className="sidebar-logout" onClick={onLogout}><LogOut size={16} /> Sign out</button></div></aside>;
}

function MobileNav({ nav, route, navigate }) { return <nav className="mobile-nav">{nav.map(item => <button key={item.name} className={route.name === item.name ? 'active' : ''} onClick={() => navigate(item.name)}><item.icon size={20} /><span>{item.label.replace('Customer ', '').replace('My ', '')}</span></button>)}</nav>; }

function PartnerInfo({ type, navigate }) { const content = type === 'about' ? SALON_ABOUT_CONTENT : type === 'faq' ? SALON_FAQ_CONTENT : SALON_TERMS_CONTENT; return <div className="screen info-screen"><div className="page-header"><div className="page-header-leading"><button className="icon-btn ghost" onClick={() => navigate(-1)} aria-label="Go back"><ChevronRight size={19} className="rotate-180" /></button><div><span className="eyebrow">{content.eyebrow}</span><h1>{content.title}</h1></div></div></div><div className="info-intro"><Sparkles size={18} /><p>{content.intro || 'Everything you need to know about partnering with My Naai.'}</p></div><div className="info-sections">{content.sections.map(section => <section key={section.title}><h2>{section.title}</h2><p>{section.text}</p></section>)}</div><div className="info-contact"><span className="info-contact-icon"><HelpCircle size={18} /></span><div><strong>Need more help?</strong><p>Call our partner team on 8380017393</p></div><button onClick={() => window.open('tel:8380017393')}><ChevronRight size={17} /></button></div></div>; }

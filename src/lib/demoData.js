export const DEMO_USER = {
  userId: 'demo-user-001',
  fullName: 'Arjun Mehta',
  phoneNumber: '9876543210',
};

const hours = (openingTime = '09:00:00', closingTime = '21:00:00', holidayDays = []) => ([
  { openingTime, closingTime, holidayDays, breakStartTime: null, breakEndTime: null },
]);

const service = (serviceId, serviceName, price, durationMinutes, description = 'A thoughtful finish from our specialists.') => ({
  serviceId,
  serviceName,
  price: String(price),
  durationMinutes,
  description,
});

const commonServices = [
  service('service-cut', 'Signature Haircut', 299, 35, 'A tailored cut, wash and finish.'),
  service('service-fade', 'Fade & Styling', 449, 50, 'Clean fades and expert styling.'),
  service('service-beard', 'Beard Sculpt', 199, 25, 'Shape, line-up and hot towel finish.'),
  service('service-spa', 'Head Massage', 349, 30, 'Reset with a relaxing oil massage.'),
  service('service-facial', 'Glow Facial', 699, 55, 'A fresh, hydrated glow for every occasion.'),
  service('service-color', 'Hair Colour', 899, 75, 'Professional colour with a polished finish.'),
];

const demoBarbers = [
  { barberId: 'barber-rohan', fullName: 'Rohan Deshmukh', profileImageUrl: 'naai/barber1.jpeg', isAvailable: true, ratingAverage: '4.9' },
  { barberId: 'barber-maya', fullName: 'Maya Kapoor', profileImageUrl: 'naai/barber4.jpeg', isAvailable: true, ratingAverage: '4.8' },
  { barberId: 'barber-vikram', fullName: 'Vikram Rao', profileImageUrl: 'naai/barber2.jpeg', isAvailable: false, ratingAverage: '4.7' },
];

export const DEMO_SALONS = [
  {
    salonId: 'salon-atelier-17',
    salonName: 'Atelier 17 Grooming',
    genderType: 'UNISEX',
    addressLine1: 'Civil Lines, Nagpur',
    city: 'Nagpur',
    ratingAverage: '4.9',
    totalReviews: 128,
    phoneNumber: '8380017393',
    latitude: 21.1458,
    longitude: 79.0882,
    imageUrl: 'naai/salon1.jpg',
    imagesArray: ['naai/salon1.jpg', 'naai/naai2.jpeg', 'naai/naai3.jpg'],
    businessHours: hours('09:00:00', '21:30:00'),
    totalWaitTime: { display: '10–15 min' },
    services: commonServices,
    barbers: demoBarbers,
    upcomingHoliday: null,
  },
  {
    salonId: 'salon-house-of-fade',
    salonName: 'House of Fade',
    genderType: 'MALE',
    addressLine1: 'Dharampeth, Nagpur',
    city: 'Nagpur',
    ratingAverage: '4.8',
    totalReviews: 94,
    phoneNumber: '8380017394',
    latitude: 21.1346,
    longitude: 79.0791,
    imageUrl: 'naai/naai1.jpg',
    imagesArray: ['naai/naai1.jpg', 'naai/barber3.jpg'],
    businessHours: hours('10:00:00', '20:00:00'),
    totalWaitTime: { display: '20–25 min' },
    services: commonServices.slice(0, 4),
    barbers: demoBarbers,
    upcomingHoliday: null,
  },
  {
    salonId: 'salon-studio-rose',
    salonName: 'Studio Rose Beauty',
    genderType: 'FEMALE',
    addressLine1: 'Wardha Road, Nagpur',
    city: 'Nagpur',
    ratingAverage: '4.7',
    totalReviews: 76,
    phoneNumber: '8380017395',
    latitude: 21.1177,
    longitude: 79.0513,
    imageUrl: 'naai/ad3.jpg',
    imagesArray: ['naai/ad3.jpg', 'naai/naai2.jpeg'],
    businessHours: hours('09:30:00', '19:30:00', ['Sunday']),
    totalWaitTime: { display: '5–10 min' },
    services: [commonServices[4], commonServices[5], commonServices[0], commonServices[3]],
    barbers: demoBarbers.slice(0, 2),
    upcomingHoliday: 'Sunday',
  },
  {
    salonId: 'salon-northside',
    salonName: 'Northside Studio',
    genderType: 'UNISEX',
    addressLine1: 'Sadar, Nagpur',
    city: 'Nagpur',
    ratingAverage: '4.6',
    totalReviews: 51,
    phoneNumber: '8380017396',
    latitude: 21.1681,
    longitude: 79.0748,
    imageUrl: 'naai/ad2.jpg',
    imagesArray: ['naai/ad2.jpg'],
    businessHours: hours('08:30:00', '19:00:00'),
    totalWaitTime: { display: '15–20 min' },
    services: commonServices.slice(0, 5),
    barbers: demoBarbers.slice(1),
    upcomingHoliday: null,
  },
];

export const DEMO_ADS = [
  { src: '/assets/naai/ad1.jpg', title: 'A better cut starts here', kicker: 'Find your next favourite chair' },
  { src: '/assets/naai/ad2.jpg', title: 'Good hair days, on demand', kicker: 'Book your time — skip the queue' },
  { src: '/assets/naai/ad3.jpg', title: 'Look good. Feel ready.', kicker: 'Specialists around Nagpur' },
];

export const DEMO_BOOKINGS = [
  {
    bookingId: 'booking-demo-1',
    salonName: 'Atelier 17 Grooming',
    salonCity: 'Nagpur',
    barberName: 'Rohan Deshmukh',
    serviceName: 'Signature Haircut, Beard Sculpt',
    bookingDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    bookingTime: '17:30',
    status: 'CONFIRMED',
  },
  {
    bookingId: 'booking-demo-2',
    salonName: 'Studio Rose Beauty',
    salonCity: 'Nagpur',
    barberName: 'Maya Kapoor',
    serviceName: 'Glow Facial',
    bookingDate: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
    bookingTime: '11:00',
    status: 'PENDING',
  },
];

export const DEMO_PRODUCTS = [
  { productId: 'product-1', productName: 'Matte Clay Pomade', price: '499', rating: '4.8', isAvailable: true, productImage: 'naai/barber5.jpg', salon: { salonName: 'Atelier 17 Grooming' } },
  { productId: 'product-2', productName: 'Hydrating Beard Oil', price: '349', rating: '4.7', isAvailable: true, productImage: 'naai/barber2.jpeg', salon: { salonName: 'House of Fade' } },
  { productId: 'product-3', productName: 'Daily Repair Shampoo', price: '699', rating: '4.6', isAvailable: true, productImage: 'naai/ad2.jpg', salon: { salonName: 'Studio Rose Beauty' } },
  { productId: 'product-4', productName: 'Texturising Sea Salt Spray', price: '599', rating: '4.5', isAvailable: false, productImage: 'naai/ad1.jpg', salon: { salonName: 'Northside Studio' } },
];

export const DEMO_QUEUE = [
  { bookingId: 'queue-1', userName: 'Priya Sharma', userPhone: '9876501234', barberName: 'Maya Kapoor', serviceNames: 'Glow Facial', bookingDate: new Date().toISOString().slice(0, 10), bookingTime: '16:30', queueNumber: 'A-04' },
  { bookingId: 'queue-2', userName: 'Aman Verma', userPhone: '9876501235', barberName: 'Rohan Deshmukh', serviceNames: 'Signature Haircut, Beard Sculpt', bookingDate: new Date().toISOString().slice(0, 10), bookingTime: '17:00', queueNumber: 'A-05' },
  { bookingId: 'queue-3', userName: 'Nikhil Jain', userPhone: '0000000000', barberName: '', serviceNames: 'Fade & Styling', bookingDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), bookingTime: '10:30', queueNumber: 'B-01' },
  { bookingId: 'queue-4', userName: 'Meera Joshi', userPhone: '9876501237', barberName: 'Maya Kapoor', serviceNames: 'Hair Colour', bookingDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), bookingTime: '12:30', queueNumber: 'C-02' },
];

export const DEMO_HISTORY = [
  { bookingId: 'history-1', userName: 'Sakshi Patil', userPhone: '9876501266', barberName: 'Maya Kapoor', services: 'Glow Facial', bookingDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10), bookingTime: '14:00' },
  { bookingId: 'history-2', userName: 'Rahul Kulkarni', userPhone: '9876501277', barberName: 'Rohan Deshmukh', services: 'Signature Haircut', bookingDate: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10), bookingTime: '18:30' },
  { bookingId: 'history-3', userName: 'Anjali Rao', userPhone: '9876501288', barberName: 'Maya Kapoor', services: 'Hair Colour', bookingDate: new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10), bookingTime: '11:30' },
];

export const DEMO_NOTIFICATIONS = [
  { notificationId: 'notification-1', id: 'notification-1', title: 'Booking confirmed', body: 'Your appointment at Atelier 17 Grooming is confirmed for tomorrow at 5:30 PM.', createdAt: new Date(Date.now() - 45 * 60000).toISOString() },
  { notificationId: 'notification-2', id: 'notification-2', title: 'Welcome to MyNaai', body: 'Save your favourite salon to get back to it faster.', createdAt: new Date(Date.now() - 4 * 3600000).toISOString() },
  { notificationId: 'notification-3', id: 'notification-3', title: 'New look, less wait', body: 'Explore top-rated specialists near you today.', createdAt: new Date(Date.now() - 86400000).toISOString() },
];

export const DEMO_SALON_PROFILE = {
  salonId: 'salon-atelier-17',
  salonName: 'Atelier 17 Grooming',
  ownerName: 'Rohan Deshmukh',
  addressLine1: 'Civil Lines, Nagpur',
  city: 'Nagpur',
  genderType: 'UNISEX',
  phoneNumber: '8380017393',
  imageUrl: 'naai/salon1.jpg',
  imagesArray: ['naai/salon1.jpg', 'naai/naai2.jpeg', 'naai/naai3.jpg'],
  latitude: 21.1458,
  longitude: 79.0882,
  ratingAverage: '4.9',
  totalReviews: 128,
  isOpen: true,
  businessHours: hours('09:00:00', '21:30:00'),
  services: commonServices,
  barbers: demoBarbers,
};

export const DEFAULT_SERVICES = {
  male: [
    service('new-male-cut', 'Normal Hair Cut', 40, 20, 'Classic haircut.'),
    service('new-male-fade', 'Stylish / Fade Hair Cut', 40, 40, 'Modern fade and finish.'),
    service('new-male-shave', 'Shaving (Normal)', 40, 20, 'Clean and comfortable shave.'),
    service('new-male-beard', 'Beard Trimming', 40, 20, 'Shape and line-up.'),
    service('new-male-massage', 'Head Massage (Oil)', 40, 20, 'Relaxing oil massage.'),
  ],
  female: [
    service('new-female-brow', 'Eyebrow Threading', 40, 20, 'Precise brow shaping.'),
    service('new-female-face', 'Full Face Threading', 40, 40, 'Smooth, defined finish.'),
    service('new-female-cut', 'Hair Cut (Straight / U / V)', 40, 20, 'A polished everyday cut.'),
    service('new-female-facial', 'Normal Facial', 40, 40, 'Fresh and nourishing facial.'),
  ],
  unisex: commonServices.slice(0, 5),
};

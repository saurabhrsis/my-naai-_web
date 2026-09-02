const service = (serviceId, serviceName, price, durationMinutes, description) => ({
  serviceId,
  serviceName,
  price: String(price),
  durationMinutes,
  description,
});

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
  unisex: [
    service('new-unisex-cut', 'Signature Haircut', 299, 35, 'A tailored cut, wash and finish.'),
    service('new-unisex-fade', 'Fade & Styling', 449, 50, 'Clean fades and expert styling.'),
    service('new-unisex-beard', 'Beard Sculpt', 199, 25, 'Shape, line-up and hot towel finish.'),
    service('new-unisex-spa', 'Head Massage', 349, 30, 'Reset with a relaxing oil massage.'),
    service('new-unisex-facial', 'Glow Facial', 699, 55, 'A fresh, hydrated glow for every occasion.'),
  ],
};

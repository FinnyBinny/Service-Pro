document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  const successEl = document.getElementById('form-success');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (validateForm(form)) {
      form.style.display = 'none';
      successEl.classList.add('visible');
      successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // Live validation on blur
  form.querySelectorAll('.form-input, .form-select, .form-textarea').forEach(input => {
    input.addEventListener('blur', () => validateField(input));
    input.addEventListener('input', () => {
      if (input.closest('.form-group').classList.contains('has-error')) {
        validateField(input);
      }
    });
  });
});

function validateForm(form) {
  let valid = true;
  form.querySelectorAll('[required]').forEach(field => {
    if (!validateField(field)) valid = false;
  });
  return valid;
}

function validateField(field) {
  const group = field.closest('.form-group');
  const errorEl = group?.querySelector('.form-error');
  let message = '';

  if (field.hasAttribute('required') && !field.value.trim()) {
    message = 'This field is required.';
  } else if (field.type === 'email' && field.value.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim())) {
      message = 'Please enter a valid email address.';
    }
  } else if (field.type === 'tel' && field.value.trim()) {
    if (!/^[\d\s\-\+\(\)]{7,}$/.test(field.value.trim())) {
      message = 'Please enter a valid phone number.';
    }
  }

  if (group) {
    group.classList.toggle('has-error', !!message);
    if (errorEl) errorEl.textContent = message;
  }

  return !message;
}

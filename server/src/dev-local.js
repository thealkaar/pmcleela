process.env.NODE_ENV = 'development';
process.env.PMC_LOCAL_MODE = '1';
process.env.DATABASE_URL = '';
process.env.DIRECT_URL = '';
process.env.BREVO_API_KEY = '';
process.env.R2_BUCKET_NAME = '';
process.env.R2_ACCOUNT_ID = '';
process.env.R2_ACCESS_KEY_ID = '';
process.env.R2_SECRET_ACCESS_KEY = '';
process.env.PMC_ADMIN_EMAIL = '';
process.env.PMC_ADMIN_PASSWORD = '';
process.env.PMC_ADMIN_SESSION_SECRET = '';

require('./index');

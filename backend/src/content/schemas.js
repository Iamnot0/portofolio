import { z } from 'zod';
import { HttpError } from '../http.js';

const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';
const MAX_URL_LENGTH = 2048;

const parseUrl = (value) => URL.parse(value);
const isHttps = (url) => url?.protocol === 'https:' && !url.username && !url.password;

const httpsUrl = (label) =>
  z
    .string({ error: `${label} must be text` })
    .max(MAX_URL_LENGTH, `${label} is too long`)
    .refine((value) => isHttps(parseUrl(value)), `${label} must be an https URL`)
    .nullable();

const blobUrl = (label) =>
  z
    .string({ error: `${label} must be text` })
    .max(MAX_URL_LENGTH, `${label} is too long`)
    .refine((value) => {
      const url = parseUrl(value);
      return isHttps(url) && url.hostname.endsWith(BLOB_HOST_SUFFIX);
    }, `${label} must be hosted on the Blob store`)
    .nullable();

const text = (label, max, { required = false } = {}) => {
  const base = z.string({ error: `${label} must be text` }).trim().max(max, `${label} must be at most ${max} characters`);
  return required ? base.min(1, `${label} is required`) : base;
};

const body = (shape) => z.object(shape, { error: 'Body must be a JSON object' });

// Updates replace the whole row, so every field is required. Creates fall back to these defaults.
const withDefaults = (fields, defaults) =>
  Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, name in defaults ? field.default(defaults[name]) : field]));

const projectFields = {
  title: text('Title', 120, { required: true }),
  purpose: text('Purpose', 300),
  stack: text('Stack', 160),
  link: httpsUrl('Link'),
  imageUrl: blobUrl('Image URL'),
  published: z.boolean({ error: 'Published must be true or false' }),
};
const projectDefaults = { purpose: '', stack: '', link: null, imageUrl: null, published: true };

const certificateFields = {
  title: text('Title', 120, { required: true }),
  issuerMeta: text('Issuer', 120),
  verifyUrl: httpsUrl('Verify URL'),
  imageUrl: blobUrl('Image URL'),
  published: z.boolean({ error: 'Published must be true or false' }),
};
const certificateDefaults = { issuerMeta: '', verifyUrl: null, imageUrl: null, published: true };

export const projectCreateSchema = body(withDefaults(projectFields, projectDefaults));
export const projectUpdateSchema = body(projectFields);
export const certificateCreateSchema = body(withDefaults(certificateFields, certificateDefaults));
export const certificateUpdateSchema = body(certificateFields);

export const orderSchema = body({
  ids: z
    .array(z.number({ error: 'Order ids must be whole numbers' }).int('Order ids must be whole numbers').positive('Order ids must be whole numbers').max(2_147_483_647, 'Order ids must be whole numbers'), {
      error: 'Order ids must be a list',
    }),
});

export const cvSchema = body({
  fileUrl: blobUrl('File URL').refine((value) => value !== null, 'File URL is required'),
  fileName: text('File name', 255, { required: true }),
});

export function parseBody(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, result.error.issues[0].message);
  return result.data;
}

import { defineEventHandler } from 'h3';
import { serveImage } from '@quantum/shared/server/utils/images';

export default defineEventHandler(serveImage);

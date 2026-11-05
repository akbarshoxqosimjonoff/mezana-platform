FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build
EXPOSE 3005
ENV NODE_ENV=production
ENV PORT=3005
CMD ["npm", "run", "start"]
FROM node:18-alpine

# Install FFmpeg for HLS & Transcoding
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 1935 8000 3001

CMD ["npm", "start"]

FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node deps
COPY package*.json ./
RUN npm ci --omit=dev

# Install Python deps
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
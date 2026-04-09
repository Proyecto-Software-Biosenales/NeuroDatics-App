FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better cache)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

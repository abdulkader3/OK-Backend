import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import cookieParser from "cookie-parser";
import User from "../src/models/user.model.js";
import authRoutes from "../src/routes/auth.routes.js";

let mongoServer;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/v1/auth", authRoutes);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  
  process.env.ACCESS_TOKEN_SECRET = "test_access_secret";
  process.env.ACCESS_TOKEN_EXPIRY = "1h";
  process.env.REFRESH_TOKEN_SECRET = "test_refresh_secret";
  process.env.REFRESH_TOKEN_EXPIRY = "7d";
  process.env.NODE_ENV = "test";
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

describe("POST /api/v1/auth/register", () => {
  const validUser = {
    name: "John Doe",
    email: "john@example.com",
    password: "password123",
    phone: "+1234567890",
    company: "Acme Inc",
  };

  it("should register user successfully and return 201 with tokens", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send(validUser)
      .expect(201);

    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty("message", "User registered successfully");
    expect(response.body).toHaveProperty("data");
    expect(response.body.data).toHaveProperty("user");
    expect(response.body.data.user).toHaveProperty("id");
    expect(response.body.data.user.name).toBe(validUser.name);
    expect(response.body.data.user.email).toBe(validUser.email.toLowerCase());
    expect(response.body.data.user.phone).toBe(validUser.phone);
    expect(response.body.data.user.company).toBe(validUser.company);
    expect(response.body.data.user).not.toHaveProperty("password_hash");
    expect(response.body.data.user).not.toHaveProperty("password");
    expect(response.body.data).toHaveProperty("tokens");
    expect(response.body.data.tokens).toHaveProperty("access_token");
    expect(response.body.data.tokens).toHaveProperty("refresh_token");

    const userInDb = await User.findOne({ email: validUser.email.toLowerCase() });
    expect(userInDb).not.toBeNull();
  });

  it("should return 409 for duplicate email", async () => {
    await User.create({
      name: validUser.name,
      email: validUser.email.toLowerCase(),
      password_hash: validUser.password,
    });

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send(validUser)
      .expect(409);

    expect(response.body).toHaveProperty("success", false);
    expect(response.body).toHaveProperty("message", "Email already registered");
  });

  it("should return 400 for invalid name (too short)", async () => {
    const invalidUser = { ...validUser, name: "A" };

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send(invalidUser)
      .expect(400);

    expect(response.body).toHaveProperty("success", false);
    expect(response.body).toHaveProperty("message", "Validation failed");
    expect(response.body).toHaveProperty("errors");
    expect(response.body.errors).toContainEqual(
      expect.objectContaining({ field: "name" })
    );
  });

  it("should return 400 for invalid email format", async () => {
    const invalidUser = { ...validUser, email: "notanemail" };

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send(invalidUser)
      .expect(400);

    expect(response.body).toHaveProperty("success", false);
    expect(response.body.errors).toContainEqual(
      expect.objectContaining({ field: "email" })
    );
  });

  it("should return 400 for password too short", async () => {
    const invalidUser = { ...validUser, password: "short" };

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send(invalidUser)
      .expect(400);

    expect(response.body).toHaveProperty("success", false);
    expect(response.body.errors).toContainEqual(
      expect.objectContaining({ field: "password" })
    );
  });

  it("should return 400 for missing required fields", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({})
      .expect(400);

    expect(response.body).toHaveProperty("success", false);
    expect(response.body.errors).toHaveLength(3);
    const fields = response.body.errors.map((e) => e.field);
    expect(fields).toContain("name");
    expect(fields).toContain("email");
    expect(fields).toContain("password");
  });

  it("should not return password in response", async () => {
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send(validUser)
      .expect(201);

    expect(response.body.data.user).not.toHaveProperty("password_hash");
    expect(response.body.data.user).not.toHaveProperty("password");
    expect(response.body.data.user).not.toHaveProperty("refresh_token");
  });

  it("should handle optional phone and company fields", async () => {
    const userWithoutOptional = {
      name: "Jane Doe",
      email: "jane@example.com",
      password: "password123",
    };

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send(userWithoutOptional)
      .expect(201);

    expect(response.body.data.user.phone).toBeNull();
    expect(response.body.data.user.company).toBeNull();
  });
});

import jwt from "jsonwebtoken";

const mockFindOne = jest.fn();
const mockCountDocuments = jest.fn();
const mockCreate = jest.fn();

jest.mock("../../src/models/user.model.js", () => ({
  __esModule: true,
  default: {
    findOne: mockFindOne,
    countDocuments: mockCountDocuments,
    create: mockCreate,
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock("../../src/models/index.js", () => ({
  AuditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("../../src/utils/ApiErrors.js", () => {
  class ApiErrors extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
      this.message = message;
    }
  }
  return { ApiErrors };
});

jest.mock("../../src/utils/asyncHandlers.js", () => ({
  asyncHandler: (fn) => fn,
}));

describe("Auth Controller", () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      cookies: {},
      ip: "127.0.0.1",
      get: jest.fn().mockReturnValue("Mozilla/5.0"),
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("should register a new user successfully", async () => {
      mockReq.body = {
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      };

      User.findOne.mockResolvedValue(null);
      User.countDocuments.mockResolvedValue(0);
      User.create.mockResolvedValue({
        _id: "user123",
        name: "Test User",
        email: "test@example.com",
        role: "owner",
        toJSON: () => ({ name: "Test User", email: "test@example.com", role: "owner" }),
      });
      User.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "User registered successfully",
        })
      );
    });

    it("should throw error for duplicate email", async () => {
      mockReq.body = {
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      };

      User.findOne.mockResolvedValue({ email: "test@example.com" });

      await register(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "Email already registered",
        })
      );
    });

    it("should set first user as owner automatically", async () => {
      mockReq.body = {
        name: "First User",
        email: "first@example.com",
        password: "password123",
        role: "staff",
      };

      User.findOne.mockResolvedValue(null);
      User.countDocuments.mockResolvedValue(0);
      User.create.mockResolvedValue({
        _id: "user123",
        name: "First User",
        email: "first@example.com",
        role: "owner",
        toJSON: () => ({ name: "First User", email: "first@example.com", role: "owner" }),
      });
      User.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await register(mockReq, mockRes, mockNext);

      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "owner",
        })
      );
    });
  });

  describe("login", () => {
    it("should login successfully with valid credentials", async () => {
      mockReq.body = {
        email: "test@example.com",
        password: "password123",
      };

      const mockUser = {
        _id: "user123",
        email: "test@example.com",
        passwordHash: "hashedpassword",
        active: true,
        comparePassword: jest.fn().mockResolvedValue(true),
        toJSON: () => ({ email: "test@example.com", active: true }),
      };

      User.findOne.mockResolvedValue(mockUser);
      User.findByIdAndUpdate = jest.fn().mockResolvedValue({});

      await login(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "Login successful",
        })
      );
    });

    it("should throw error for invalid email", async () => {
      mockReq.body = {
        email: "wrong@example.com",
        password: "password123",
      };

      User.findOne.mockResolvedValue(null);

      await login(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it("should throw error for invalid password", async () => {
      mockReq.body = {
        email: "test@example.com",
        password: "wrongpassword",
      };

      const mockUser = {
        _id: "user123",
        email: "test@example.com",
        active: true,
        comparePassword: jest.fn().mockResolvedValue(false),
      };

      User.findOne.mockResolvedValue(mockUser);

      await login(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it("should throw error for inactive user", async () => {
      mockReq.body = {
        email: "test@example.com",
        password: "password123",
      };

      const mockUser = {
        _id: "user123",
        email: "test@example.com",
        active: false,
        comparePassword: jest.fn().mockResolvedValue(true),
      };

      User.findOne.mockResolvedValue(mockUser);

      await login(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });
});

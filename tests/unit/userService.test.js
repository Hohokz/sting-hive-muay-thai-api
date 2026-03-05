const userService = require('../../services/userService');
const User = require('../../models/User');
const bcrypt = require('bcryptjs');

// Mock User model
jest.mock('../../models/User');
jest.mock('bcryptjs');

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllUsers', () => {
    test('should return all users excluding password', async () => {
      const mockUsers = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
      User.findAll.mockResolvedValue(mockUsers);

      const result = await userService.getAllUsers();

      expect(User.findAll).toHaveBeenCalledWith(expect.objectContaining({
        attributes: { exclude: ['password'] }
      }));
      expect(result).toEqual(mockUsers);
    });

    test('should throw error if findAll fails', async () => {
      User.findAll.mockRejectedValue(new Error('DB Error'));
      await expect(userService.getAllUsers()).rejects.toThrow('ไม่สามารถดึงข้อมูลผู้ใช้ได้: DB Error');
    });
  });

  describe('getUserById', () => {
    test('should return user if found', async () => {
      const mockUser = { id: 1, name: 'Alice' };
      User.findByPk.mockResolvedValue(mockUser);

      const result = await userService.getUserById(1);

      expect(User.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
      expect(result).toEqual(mockUser);
    });

    test('should throw 404 if user not found', async () => {
      User.findByPk.mockResolvedValue(null);
      try {
        await userService.getUserById(99);
      } catch (error) {
        expect(error.message).toBe('ไม่พบข้อมูลผู้ใช้');
        expect(error.status).toBe(404);
      }
    });
  });

  describe('createUser', () => {
    const userData = {
      username: 'newuser',
      password: 'password123',
      name: 'New User',
      email: 'new@example.com',
      role: 'USER'
    };

    test('should create a new user successfully', async () => {
      User.findOne.mockResolvedValue(null); // No existing user
      bcrypt.hash.mockResolvedValue('hashed_password');
      User.create.mockResolvedValue({
        toJSON: () => ({ ...userData, id: 10, password: 'hashed_password' })
      });

      const result = await userService.createUser(userData, 1);

      expect(User.findOne).toHaveBeenCalledTimes(2); // Check username and email
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(User.create).toHaveBeenCalled();
      expect(result.id).toBe(10);
      expect(result.password).toBeUndefined();
    });

    test('should throw error if username exists', async () => {
      User.findOne.mockResolvedValue({ id: 1 });
      await expect(userService.createUser(userData, 1)).rejects.toThrow('Username นี้ถูกใช้งานไปแล้ว');
    });
  });

  describe('deleteUser', () => {
    test('should delete user if exists', async () => {
      const mockUser = { id: 1, destroy: jest.fn().mockResolvedValue() };
      User.findByPk.mockResolvedValue(mockUser);

      const result = await userService.deleteUser(1);

      expect(mockUser.destroy).toHaveBeenCalled();
      expect(result.message).toBe('ลบผู้ใช้สำเร็จแล้ว');
    });

    test('should throw error if user not found for deletion', async () => {
      User.findByPk.mockResolvedValue(null);
      await expect(userService.deleteUser(99)).rejects.toThrow('ไม่พบข้อมูลผู้ใช้');
    });
  });
});

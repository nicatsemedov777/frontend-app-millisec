import './style.css'

type Role = 'ADMIN' | 'USER'

interface UserLoginRequest {
  mail: string
  password: string
}

interface UserRegisterRequest {
  name: string
  surname: string
  age: number
  mail: string
  password: string
}

interface JwtToken {
  token: string
  createDate: number
  expirationDate: number
}

interface UserResponse {
  id: number
  name: string
  surname: string
  mail: string
  age: number
  createdAt: string
}

const API_HOST = import.meta.env.VITE_API_BASE_URL || 'https://millisec.courses'
const API_BASE_URL = `${API_HOST}/api/v1`
const TOKEN_STORAGE_KEY = 'authToken'
const TOKEN_META_KEY = 'tokenMeta'
const ROLE_STORAGE_KEY = 'authRole'
const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root not found')
}
const appRoot: HTMLDivElement = app

const state = {
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  role: (localStorage.getItem(ROLE_STORAGE_KEY) as Role | null) ?? null,
}

function setAlert(message: string, type: 'success' | 'error' = 'error') {
  const alertNode = document.querySelector<HTMLDivElement>('#global-alert')
  if (!alertNode) {
    return
  }
  alertNode.textContent = message
  alertNode.className = `alert ${type}`
}

function clearAlert() {
  const alertNode = document.querySelector<HTMLDivElement>('#global-alert')
  if (!alertNode) {
    return
  }
  alertNode.textContent = ''
  alertNode.className = 'alert hidden'
}

function saveToken(token: JwtToken, fromLogin: boolean) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token.token)
  localStorage.setItem(TOKEN_META_KEY, JSON.stringify(token))

  if (fromLogin) {
    const maxAgeSeconds = Math.max(
      Math.floor((token.expirationDate - Date.now()) / 1000),
      0
    )
    document.cookie = `JSESSIONID=${token.token}; path=/; max-age=${maxAgeSeconds}; samesite=lax`
  }

  state.token = token.token
  const roleFromToken = getRoleFromToken(token.token)
  if (roleFromToken) {
    state.role = roleFromToken
    localStorage.setItem(ROLE_STORAGE_KEY, roleFromToken)
  }
}

function clearSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_META_KEY)
  localStorage.removeItem(ROLE_STORAGE_KEY)
  document.cookie = 'JSESSIONID=; path=/; max-age=0; samesite=lax'
  state.token = null
  state.role = null
}

function getRoleFromToken(token: string): Role | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.role === 'ADMIN' || payload.role === 'USER') {
      return payload.role
    }
    if (Array.isArray(payload.authorities)) {
      if (payload.authorities.includes('ADMIN')) {
        return 'ADMIN'
      }
      if (payload.authorities.includes('USER')) {
        return 'USER'
      }
    }
    return null
  } catch {
    return null
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')

  if (state.token) {
    headers.set('Authorization', `Bearer ${state.token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with status ${response.status}`)
  }

  return (await response.json()) as T
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validatePassword(password: string) {
  return (
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password) &&
    password.length >= 8
  )
}

function renderLayout(content: string) {
  appRoot.innerHTML = `
    <main class="container">
      <header class="header">
        <h1>MILLISEC CONSOLE</h1>
        <div class="actions">
          ${state.token ? '<button id="logout-btn" class="secondary">Logout</button>' : ''}
        </div>
      </header>
      <div id="global-alert" class="alert hidden"></div>
      ${content}
    </main>
  `

  const logoutButton = document.querySelector<HTMLButtonElement>('#logout-btn')
  logoutButton?.addEventListener('click', () => {
    clearSession()
    renderLoginPage()
  })
}

function renderLoginPage() {
  renderLayout(`
    <section class="card">
      <h2>Login</h2>
      <form id="login-form" class="form">
        <label>Email <input name="mail" type="email" required /></label>
        <label>Password <input name="password" type="password" required /></label>
        <button type="submit">Sign in</button>
      </form>
      <p class="hint">No account? <button id="go-register" class="link-button" type="button">Register as USER</button></p>
    </section>
  `)

  const loginForm = document.querySelector<HTMLFormElement>('#login-form')
  const registerButton = document.querySelector<HTMLButtonElement>('#go-register')

  registerButton?.addEventListener('click', renderRegisterPage)

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    clearAlert()

    const data = new FormData(loginForm)
    const payload: UserLoginRequest = {
      mail: String(data.get('mail') ?? '').trim(),
      password: String(data.get('password') ?? ''),
    }

    if (!validateEmail(payload.mail)) {
      setAlert('Please enter a valid email address.')
      return
    }

    try {
      const token = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then(async (response) => {
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text || `Request failed with status ${response.status}`)
        }

        return (await response.json()) as JwtToken
      })
      saveToken(token, true)
      setAlert('Login successful.', 'success')
      renderDashboard()
    } catch (error) {
      setAlert((error as Error).message || 'Login failed.')
    }
  })
}

function renderRegisterPage() {
  renderLayout(`
    <section class="card">
      <h2>Register (USER)</h2>
      <form id="register-form" class="form">
        <label>Name <input name="name" required /></label>
        <label>Surname <input name="surname" required /></label>
        <label>Age <input name="age" type="number" min="1" required /></label>
        <label>Email <input name="mail" type="email" required /></label>
        <label>Password <input name="password" type="password" required /></label>
        <small class="help-text">Password must be minimum 8 characters with uppercase, lowercase, number, and special character.</small>
        <button type="submit">Create account</button>
      </form>
      <p class="hint">Already have an account? <button id="go-login" class="link-button" type="button">Back to login</button></p>
    </section>
  `)

  const registerForm = document.querySelector<HTMLFormElement>('#register-form')
  const loginButton = document.querySelector<HTMLButtonElement>('#go-login')
  loginButton?.addEventListener('click', renderLoginPage)

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    clearAlert()

    const data = new FormData(registerForm)
    const payload: UserRegisterRequest = {
      name: String(data.get('name') ?? '').trim(),
      surname: String(data.get('surname') ?? '').trim(),
      age: Number(data.get('age') ?? 0),
      mail: String(data.get('mail') ?? '').trim(),
      password: String(data.get('password') ?? ''),
    }

    if (!validateEmail(payload.mail)) {
      setAlert('Please enter a valid email address.')
      return
    }
    if (!validatePassword(payload.password)) {
      setAlert('Password does not meet complexity requirements.')
      return
    }
    if (!Number.isInteger(payload.age) || payload.age <= 0) {
      setAlert('Age must be a positive number.')
      return
    }

    try {
      const token = await request<JwtToken>('/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      saveToken(token, false)
      setAlert('Registration successful.', 'success')
      renderDashboard()
    } catch (error) {
      setAlert((error as Error).message || 'Registration failed.')
    }
  })
}

function userListToHtml(users: UserResponse[]) {
  if (!users.length) {
    return '<p class="hint">No users found.</p>'
  }

  const rows = users
    .map(
      (user) => `
      <tr>
        <td>${user.id}</td>
        <td>${user.name}</td>
        <td>${user.surname}</td>
        <td>${user.mail}</td>
        <td>${user.age}</td>
        <td>${new Date(user.createdAt).toLocaleString()}</td>
      </tr>`
    )
    .join('')

  return `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Surname</th>
          <th>Email</th>
          <th>Age</th>
          <th>Created At</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function renderDashboard() {
  if (!state.token) {
    renderLoginPage()
    return
  }

  renderLayout(`
    <section class="grid">
      <article class="card">
        <h2>Profile</h2>
        <button id="load-profile" class="secondary">Load My Profile</button>
        <div id="profile-output" class="output"></div>
      </article>
      <article class="card">
        <h2>Admin: All Users</h2>
        <p class="hint">Only ADMIN can access this endpoint.</p>
        <button id="load-users" class="secondary">Load Users</button>
        <div id="users-output" class="output"></div>
      </article>
    </section>
  `)

  const profileButton = document.querySelector<HTMLButtonElement>('#load-profile')
  const usersButton = document.querySelector<HTMLButtonElement>('#load-users')

  profileButton?.addEventListener('click', async () => {
    clearAlert()
    try {
      const profileResponse = await request<UserResponse | UserResponse[]>('/profile')
      const profileList = Array.isArray(profileResponse)
        ? profileResponse
        : [profileResponse]
      const target = document.querySelector<HTMLDivElement>('#profile-output')
      if (target) {
        target.innerHTML = userListToHtml(profileList)
      }
    } catch (error) {
      setAlert((error as Error).message || 'Could not load profile.')
    }
  })

  usersButton?.addEventListener('click', async () => {
    clearAlert()
    if (state.role === 'USER') {
      setAlert('Forbidden: USER role cannot access /users endpoint.')
      return
    }
    try {
      const users = await request<UserResponse[]>('/users')
      const target = document.querySelector<HTMLDivElement>('#users-output')
      if (target) {
        target.innerHTML = userListToHtml(users)
      }
    } catch (error) {
      setAlert((error as Error).message || 'Could not load users.')
    }
  })
}

if (state.token) {
  renderDashboard()
} else {
  renderLoginPage()
}

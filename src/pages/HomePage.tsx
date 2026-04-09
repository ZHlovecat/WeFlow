import { Typography } from 'antd'
import './HomePage.scss'

function HomePage() {
  return (
    <div className="home-page">
      <div className="home-bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <div className="home-content">
        <div className="hero">
          <Typography.Title level={1} className="hero-title">
            WeFlow
          </Typography.Title>
          <Typography.Text type="secondary" className="hero-subtitle">
            每一条消息的背后，都藏着一段温暖的时光
          </Typography.Text>
        </div>
      </div>
    </div>
  )
}

export default HomePage

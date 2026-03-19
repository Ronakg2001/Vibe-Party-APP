from django.urls import path
from . import views, signin_signup

urlpatterns = [
    path('', views.index_page, name='Landing page'),
    path('signin/', views.Signup_signin_page, name='Signup/Signin'),
    path('signin/forgot_password/', views.forgot_password, name='Forgot Password'),
    path('signup/details/', views.signup_details_page, name='Signup Details'),
    path('signup/profile/', views.signup_profile_page, name='Signup Profile Optional'),
    path('api/auth/mobile/send-otp', signin_signup.send_mobile_otp, name='send-mobile-otp'),
    path('api/auth/mobile/verify-otp', signin_signup.verify_mobile_otp, name='verify-mobile-otp'),
    path('api/auth/mobile/resend-otp', signin_signup.resend_mobile_otp, name='resend-mobile-otp'),
    path('api/auth/password/forgot', signin_signup.forgot_password_request, name='forgot-password-request'),
    path('api/auth/username/login', signin_signup.login_with_password, name='login-with-password'),
    path('api/signup/details', signin_signup.register_user_details, name='register-user-details'),
    path('api/signup/profile', signin_signup.complete_profile_setup, name='complete-profile-setup'),
    path('api/events/create', views.create_event_api, name='create-event-api'),
    path('api/events/<int:event_id>', views.delete_event_api, name='delete-event-api'),
    path('api/events/nearby', views.nearby_events_api, name='nearby-events-api'),
    path('api/users/search', views.search_users_api, name='search-users-api'),
    path('api/profile/me', views.current_profile_api, name='current-profile-api'),
    path('location/custom/', views.custom_location_page, name='custom-location'),
    path('party-loader-demo/', views.party_loader_demo_page, name='Party Loader Demo'),
    path('home/', views.Home_page, name='Home Page'),
    path('logout/', views.logout_view, name='Logout'),
    path('api/auth/aadhaar/send-otp', signin_signup.send_aadhaar_otp_api, name='send-aadhaar-otp'),
    path('api/auth/aadhaar/verify-otp', signin_signup.verify_aadhaar_otp_api, name='verify-aadhaar-otp'),
]

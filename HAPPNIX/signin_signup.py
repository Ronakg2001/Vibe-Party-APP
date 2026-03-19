import re
import requests
import json
from django.contrib.auth import authenticate, get_user_model, login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.http import JsonResponse
from django.db.models import Q
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_POST

from . import mongo_store
from .models import UserProfile

from .utils import _json_body, _error, _generate_otp, _calculate_age


@require_POST
def forgot_password_request(request):
    payload = _json_body(request)
    email = str(payload.get("email", "")).strip().lower()
    if not email:
        return _error("Please enter your email address.")

    try:
        validate_email(email)
    except ValidationError:
        return _error("Please enter a valid email address.")

    User = get_user_model()
    exists = User.objects.filter(email=email).exists()
    if exists:
        message = "Verification email request accepted. Please check your inbox."
    else:
        message = "If this email is registered, verification instructions will be sent."

    return JsonResponse({"message": message})


@require_POST
def send_mobile_otp(request):
    payload = _json_body(request)
    mobile = str(payload.get("mobile", "")).strip()
    if not mobile.isdigit() or len(mobile) != 10:
        return _error("Please enter a valid 10-digit mobile number.")

    otp = _generate_otp()
    print(otp)
    mobile_otp_map = request.session.get("mobile_otp_map", {})
    mobile_otp_map[mobile] = otp
    request.session["mobile_otp_map"] = mobile_otp_map
    request.session["last_mobile"] = mobile
    request.session.modified = True

    return JsonResponse(
        {
            "message": f"OTP sent successfully to {mobile}.",
            "debugOtp": otp,
        }
    )


@require_POST
def resend_mobile_otp(request):
    payload = _json_body(request)
    mobile = str(payload.get("mobile", "")).strip()
    if not mobile.isdigit() or len(mobile) != 10:
        return _error("Please enter a valid 10-digit mobile number.")

    otp = _generate_otp()
    mobile_otp_map = request.session.get("mobile_otp_map", {})
    mobile_otp_map[mobile] = otp
    request.session["mobile_otp_map"] = mobile_otp_map
    request.session.modified = True

    return JsonResponse(
        {
            "message": f"OTP resent to {mobile}.",
            "debugOtp": otp,
        }
    )


@require_POST
def verify_mobile_otp(request):
    payload = _json_body(request)
    mobile = str(payload.get("mobile", "")).strip()
    otp = str(payload.get("otp", "")).strip()
    if not mobile or not otp:
        return _error("Mobile and OTP are required.")

    mobile_otp_map = request.session.get("mobile_otp_map", {})
    saved_otp = mobile_otp_map.get(mobile)
    if not saved_otp:
        return _error("OTP session expired. Please request a new OTP.")
    if otp != saved_otp:
        return _error("Invalid OTP.")

    User = get_user_model()
    user = User.objects.filter(profile__mobile=mobile).first()
    if not user:
        user = User.objects.filter(username=mobile).first()
    if user:
        login(request, user)
        full_name = (user.first_name or user.username).strip()
        can_create_or_join_parties = (
            hasattr(user, "profile") and user.profile.gov_id_verified
        )
        status = "existing"
        message = f"Welcome back, {full_name}! Mobile OTP verified."
        redirect_url = "/home/"
    else:
        can_create_or_join_parties = False
        status = "new"
        message = "Mobile OTP verified. User not found; continue sign up."
        request.session["pending_signup_mobile"] = mobile
        request.session.modified = True
        redirect_url = "/signup/details/"

    mobile_otp_map.pop(mobile, None)
    request.session["mobile_otp_map"] = mobile_otp_map
    request.session.modified = True

    return JsonResponse(
        {
            "message": message,
            "userStatus": status,
            "canCreateOrJoinParties": can_create_or_join_parties,
            "redirectUrl": redirect_url,
        }
    )


@require_POST
def login_with_password(request):
    payload = _json_body(request)
    identifier = str(payload.get("identifier", payload.get("username", ""))).strip()
    password = str(payload.get("password", "")).strip()
    if not identifier or not password:
        return _error("Username/email and password are required.")

    User = get_user_model()
    candidate = User.objects.filter(Q(username=identifier) | Q(email__iexact=identifier)).first()
    if not candidate:
        return _error("Invalid username/email or password.", status=401)

    user = authenticate(request, username=candidate.username, password=password)
    if user is None:
        return _error("Invalid username/email or password.", status=401)

    login(request, user)
    full_name = (user.first_name or user.username).strip()
    can_create_or_join_parties = (
        hasattr(user, "profile") and user.profile.gov_id_verified
    )
    return JsonResponse(
        {
            "message": f"Signed in successfully. Welcome, {full_name}.",
            "userStatus": "existing",
            "canCreateOrJoinParties": can_create_or_join_parties,
            "redirectUrl": "/home/",
        }
    )


@require_POST
def register_user_details(request):
    pending_mobile = request.session.get("pending_signup_mobile")
    if not pending_mobile:
        return _error("Signup session expired. Verify mobile OTP again.", status=401)

    payload = _json_body(request)
    full_name = str(payload.get("fullName", "")).strip()
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", "")).strip()
    sex = str(payload.get("sex", "")).strip().lower()
    dob_text = str(payload.get("dateOfBirth", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    gov_id = str(payload.get("govId", "")).strip()

    allowed_sex = {"mr.", "miss.", "mrs.", "other"}
    if not all([full_name, username, password, sex, dob_text, email]):
        return _error("All mandatory fields are required.")
    if len(full_name) < 3:
        return _error("Please enter a valid full name.")

    if sex not in allowed_sex:
        return _error("Select a valid sex option.")

    dob = parse_date(dob_text)
    if dob is None:
        return _error("Enter a valid date of birth.")

    if _calculate_age(dob) < 18:
        return _error("You must be at least 18 years old.")

    User = get_user_model()
    if User.objects.filter(username=username).exists():
        return _error("Username already exists. Please choose another one.")

    if User.objects.filter(email=email).exists():
        return _error("Email already registered. Please use another email.")

    try:
        validate_email(email)
    except ValidationError:
        return _error("Enter a valid email address.")
    strong_password = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$")
    if not strong_password.match(password):
        return _error("Password must include uppercase, lowercase, number, special character, and minimum 8 characters.")
    try:
        validate_password(password)
    except ValidationError as err:
        return _error(" ".join(err.messages))

    if UserProfile.objects.filter(mobile=pending_mobile).exists():
        return _error("Mobile number already registered.")

    user = User.objects.create_user(
        first_name=full_name,
        username=username,
        password=password,
        email=email,
    )

    UserProfile.objects.create(
        user=user,
        sex=sex,
        date_of_birth=dob,
        mobile=pending_mobile,
        gov_id_number=gov_id,
    )
    mongo_store.sync_user_profile(user.id)

    login(request, user)
    request.session.pop("pending_signup_mobile", None)
    request.session["pending_profile_setup"] = True
    request.session.modified = True

    return JsonResponse(
        {
            "message": "Details saved successfully. You can add profile details next.",
            "canCreateOrJoinParties": False,
            "redirectUrl": "/signup/profile/",
        }
    )


@require_POST
def complete_profile_setup(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    if not request.session.get("pending_profile_setup"):
        return _error("Profile setup session not found.", status=400)

    payload = _json_body(request)
    skip = bool(payload.get("skip", False))
    bio = str(payload.get("bio", "")).strip()
    profile_picture_url = str(payload.get("profilePictureUrl", "")).strip()

    try:
        profile = UserProfile.objects.get(user=request.user)
    except UserProfile.DoesNotExist:
        return _error("Profile record missing. Please complete signup details first.", status=400)

    if not skip:
        if profile_picture_url:
            profile.profile_picture_url = profile_picture_url
        profile.bio = bio
        profile.save()

    mongo_store.sync_user_profile(request.user.id)

    request.session.pop("pending_profile_setup", None)
    request.session.modified = True

    return JsonResponse(
        {
            "message": "Profile setup completed.",
            "canCreateOrJoinParties": profile.gov_id_verified,
            "redirectUrl": "/home/",
        }
    )

KYC_API_URL = "https://sandbox.kyc-provider.com/api/v1/aadhaar" 
KYC_API_TOKEN = "YOUR_BEARER_TOKEN_HERE"

@require_POST
def send_aadhaar_otp_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
        
    payload = _json_body(request)
    aadhaar_input = str(payload.get("aadhaarNumber", "")).strip()
    
    profile = getattr(request.user, "profile", None)
    if not profile:
        return _error("User profile not found.")

    if aadhaar_input:
        if len(aadhaar_input) != 12 or not aadhaar_input.isdigit():
             return _error("Please enter a valid 12-digit Aadhaar number.")
        profile.gov_id_number = aadhaar_input
        profile.save()
        mongo_store.sync_user_profile(request.user.id)
    elif not profile.gov_id_number:
        return _error("Please provide an Aadhaar number.")

    headers = {
        "Authorization": f"Bearer {KYC_API_TOKEN}",
        "Content-Type": "application/json"
    }
    api_payload = {
        "id_number": profile.gov_id_number
    }

    try:
        response = requests.post(f"{KYC_API_URL}/generate-otp", json=api_payload, headers=headers)
        response_data = response.json()

        if response.status_code == 200 and response_data.get("success"):
            request.session["aadhaar_client_id"] = response_data.get("data", {}).get("client_id")
            request.session.modified = True

            return JsonResponse({
                "message": f"OTP sent successfully to mobile linked with Aadhaar ending in {profile.gov_id_number[-4:]}."
            })
        else:
            return _error(response_data.get("message", "Failed to send OTP. Please check Aadhaar number."))
            
    except Exception as e:
        print("API Error:", e)
        return _error("KYC Service is currently down. Please try again later.")


@require_POST
def verify_aadhaar_otp_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    payload = _json_body(request)
    otp = str(payload.get("otp", "")).strip()
    client_id = request.session.get("aadhaar_client_id")
    
    if not client_id:
        return _error("Session expired. Please request OTP again.")
    if not otp:
        return _error("Please enter the OTP.")

    headers = {
        "Authorization": f"Bearer {KYC_API_TOKEN}",
        "Content-Type": "application/json"
    }
    api_payload = {
        "client_id": client_id,
        "otp": otp
    }

    try:
        response = requests.post(f"{KYC_API_URL}/submit-otp", json=api_payload, headers=headers)
        response_data = response.json()

        if response.status_code == 200 and response_data.get("success"):
            kyc_data = response_data.get("data", {})
         
            profile = request.user.profile
            profile.gov_id_verified = True
            
            if kyc_data.get("profile_image"):
                profile.profile_picture_url = kyc_data.get("profile_image")
                
            profile.save()
            mongo_store.sync_user_profile(request.user.id)
            
            request.session.pop("aadhaar_client_id", None)
            request.session.modified = True

            return JsonResponse({
                "message": "Aadhaar verified successfully! You can now host and join parties.",
                "isVerified": True
            })
        else:
            return _error(response_data.get("message", "Invalid OTP. Please try again."))
            
    except Exception as e:
        print("API Error:", e)
        return _error("KYC verification failed due to server error.")
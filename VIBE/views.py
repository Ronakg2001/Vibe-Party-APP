from django.contrib.auth import logout
from django.shortcuts import redirect
from django.template import loader
from django.http import HttpResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods


def index_page(request):
    template = loader.get_template('index.html')
    return HttpResponse(template.render({}, request))

@never_cache
def Signup_signin_page(request):
    if request.user.is_authenticated:
        return redirect("/home/")

    template = loader.get_template('signup_signin.html')
    context = {
        "server_note": "Backend connected. You can now send and receive auth data.",
    }
    response = HttpResponse(template.render(context, request))
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response

def forgot_password(request):
    template = loader.get_template('forgot_password.html')
    return HttpResponse(template.render())

@never_cache
def Home_page(request):
    if not request.user.is_authenticated:
        return redirect("/signin/")

    template = loader.get_template('home_page.html')
    response = HttpResponse(template.render({}, request))
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response


def signup_details_page(request):
    mobile = request.session.get("pending_signup_mobile")
    if not mobile:
        return redirect("/signin/")

    template = loader.get_template("signup_details.html")
    return HttpResponse(template.render({"mobile": mobile}, request))


def signup_profile_page(request):
    if not request.user.is_authenticated:
        return redirect("/signin/")
    if not request.session.get("pending_profile_setup"):
        return redirect("/home/")

    template = loader.get_template("signup_profile_optional.html")
    return HttpResponse(template.render({}, request))


def party_loader_demo_page(request):
    template = loader.get_template("party_loader_demo.html")
    return HttpResponse(template.render({}, request))


@never_cache
@require_http_methods(["GET", "POST"])
def logout_view(request):
    logout(request)
    response = redirect("/signin/")
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response

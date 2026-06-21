import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogin, useRegister, useLogout } from "@workspace/api-client-react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// Initialize token getter for all API calls
setAuthTokenGetter(() => {
  return localStorage.getItem("investke_token");
});

export function useAuth() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(localStorage.getItem("investke_token"));

  // Fetch current user if we have a token
  const { 
    data: user, 
    isLoading: isLoadingUser, 
    error: userError,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useGetMe({ query: { enabled: !!token, retry: false } } as any);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        localStorage.setItem("investke_token", data.token);
        setToken(data.token);
        queryClient.setQueryData(["/api/auth/me"], data.user);
      }
    }
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: (data) => {
        localStorage.setItem("investke_token", data.token);
        setToken(data.token);
        queryClient.setQueryData(["/api/auth/me"], data.user);
      }
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSettled: () => {
        localStorage.removeItem("investke_token");
        setToken(null);
        queryClient.clear();
        setLocation("/");
      }
    }
  });

  // If token is invalid/expired, clear it
  useEffect(() => {
    if (userError) {
      localStorage.removeItem("investke_token");
      setToken(null);
    }
  }, [userError]);

  return {
    user,
    isLoading: isLoadingUser && !!token,
    isAuthenticated: !!user,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutate,
    isRegistering: registerMutation.isPending,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}

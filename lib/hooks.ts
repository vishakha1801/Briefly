"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";

export function useCustomers() {
  return useQuery({ queryKey: ["customers"], queryFn: api.listCustomers });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.getCustomer(id),
    enabled: Boolean(id),
  });
}

export function useCallContexts(customerId: string) {
  return useQuery({
    queryKey: ["callContexts", customerId],
    queryFn: () => api.getCallContexts(customerId),
    enabled: Boolean(customerId),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createCustomer,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useImportCallContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.importCallContext,
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ["callContexts", vars.customerId] });
      void qc.invalidateQueries({ queryKey: ["customer", vars.customerId] });
    },
  });
}

/** True at the `lg` breakpoint (>=1024px). Defaults to false before mount. */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export function useOrbSize() {
  const [size, setSize] = useState(113);
  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      if (w >= 1800) setSize(165);   // large external monitor
      else if (w >= 1024) setSize(152); // laptop / MacBook
      else setSize(113);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}
